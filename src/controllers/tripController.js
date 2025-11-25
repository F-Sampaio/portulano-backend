import { prisma } from '../prisma.js'
import PDFDocument from 'pdfkit'


function parseDate(value) {
  if (!value) return null
  const v = String(value).trim()
  if (!v) return null

  if (v.includes('/')) {
    const [day, month, year] = v.split('/')
    if (!day || !month || !year) return null
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
  }

  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function getDayDescription(notes) {
  if (!notes) return ''
  try {
    const parsed = JSON.parse(notes)
    return parsed.description || ''
  } catch (err) {
    return typeof notes === 'string' ? notes : ''
  }
}

function writeTripHeader(doc, trip) {
  doc.fontSize(18).text(trip.title || 'Viagem', { align: 'center' })
  doc.moveDown()
  const start = trip.startDate
    ? new Date(trip.startDate).toLocaleDateString('pt-BR')
    : '—'
  doc.fontSize(12).text(`Início: ${start}`)
  doc.text(`Status: ${trip.status}`)
  doc.moveDown()
  if (trip.description) {
    doc.text(trip.description)
    doc.moveDown()
  }
}

function writeTripMembers(doc, trip) {
  doc.fontSize(14).text('Participantes:')
  trip.members.forEach((m) => {
    const roleLabel = m.role === 'admin' ? 'Administrador' : 'Viewer'
    const name = m.user?.name || m.user?.email || m.userId
    doc.fontSize(12).text(`- ${name} (${roleLabel})`)
  })
  doc.moveDown()
}

function writeTripDays(doc, trip) {
  doc.fontSize(14).text('Dias da viagem:')
  trip.days.forEach((d, idx) => {
    doc.moveDown(0.5)
    doc.fontSize(12).text(`${idx + 1}. ${d.title || 'Dia'}`)
    if (d.from || d.to) {
      doc.text(`De: ${d.from || '—'} · Para: ${d.to || '—'}`)
    }
    if (d.distanceKm != null) doc.text(`Distância: ${d.distanceKm} km`)
    if (d.eta) doc.text(`ETA: ${d.eta}`)
    const desc = getDayDescription(d.notes)
    if (desc) doc.text(desc)
  })
}

function buildTripPdf(doc, trip) {
  writeTripHeader(doc, trip)
  writeTripMembers(doc, trip)
  writeTripDays(doc, trip)
}



// GET /trips
export async function listTrips(req, res) {
  try {
    const userId = req.userId ?? 1

    const trips = await prisma.trip.findMany({
      where: {
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId) } } },
        ],
      },
      include: {
        _count: {
          select: {
            days: true,
            checklist: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // normaliza BigInt -> string (sem mexer com members)
    const safe = trips.map(t => ({
      ...t,
      id: typeof t.id === 'bigint' ? t.id.toString() : t.id,
    }))

    return res.json(safe)
  } catch (err) {
    console.error('listTrips error', err)
    return res
      .status(500)
      .json({ error: 'INTERNAL_ERROR', detail: err.message })
  }
}

// POST /trips
export async function createTrip(req, res) {
  try {
    const userId = req.userId ?? 1
    const { title, description, status, startDate, endDate } = req.body
    if (!title || typeof title !== 'string') return res.status(400).json({ error: 'TITLE_REQUIRED' })

    const parsedStart = parseDate(startDate)
    const parsedEnd = parseDate(endDate)

    const trip = await prisma.trip.create({ data: {
      title,
      description: description ?? null,
      status: status ?? 'ideia',
      startDate: parsedStart,
      endDate: parsedEnd,
      createdById: String(userId),
    } })

    return res.status(201).json(trip)
  } catch (error) {
    console.error('createTrip error', error)
    return res.status(400).json({ error: 'CREATE_TRIP_FAILED', detail: error.message })
  }
}


// GET /trips/:tripId
export async function getTrip(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId } = req.params

    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId) } } },
        ],
      },
      include: {
        checklist: { orderBy: { createdAt: 'asc' } },
        days: { orderBy: { order: 'asc' } },
        members: true,
      },
    })

    if (!trip) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    }

    const isOwner = trip.createdById === String(userId)
    const member = trip.members.find((m) => m.userId === String(userId))
    const role = isOwner ? 'admin' : member?.role || 'viewer'
    const canEdit = role === 'admin'

    return res.json({ ...trip, currentRole: role, canEdit })
  } catch (err) {
    console.error('getTrip error', err)
    return res
      .status(500)
      .json({ error: 'GET_TRIP_FAILED', detail: err.message })
  }
}

// PATCH /trips/:tripId
export async function updateTrip(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId } = req.params
    const { title, description, status, startDate, endDate } = req.body

    const existing = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId), role: 'admin' } } },
        ],
      },
    })

    if (!existing) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    }

    const data = {}
    if (title !== undefined) data.title = title
    if (description !== undefined) data.description = description
    if (status !== undefined) data.status = status
    if (startDate !== undefined) {
      data.startDate = startDate ? new Date(startDate) : null
    }
    if (endDate !== undefined) {
      data.endDate = endDate ? new Date(endDate) : null
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'NO_FIELDS_TO_UPDATE' })
    }

    const updated = await prisma.trip.update({
      where: { id: tripId },
      data,
    })

    return res.json(updated)
  } catch (err) {
    console.error('updateTrip error', err)
    return res
      .status(400)
      .json({ error: 'UPDATE_TRIP_FAILED', detail: err.message })
  }
}

// POST /trips/:tripId/checklist
export async function addChecklistItem(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId } = req.params
    const { label } = req.body

    if (!label || typeof label !== 'string') {
      return res.status(400).json({ error: 'LABEL_REQUIRED' })
    }

    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId), role: 'admin' } } },
        ],
      },
    })
    if (!trip) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    }

    const item = await prisma.checkItem.create({
      data: {
        tripId,
        label,
        done: false,
      },
    })

    return res.status(201).json(item)
  } catch (err) {
    console.error('addChecklistItem error', err)
    return res
      .status(400)
      .json({ error: 'ADD_CHECKITEM_FAILED', detail: err.message })
  }
}

// PATCH /trips/:tripId/checklist/:itemId/toggle
export async function toggleCheckItem(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId, itemId } = req.params

    // garante que o item existe e pertence à trip
    const item = await prisma.checkItem.findUnique({
      where: { id: itemId },
    })

    if (!item || item.tripId !== tripId) {
      return res.status(404).json({ error: 'CHECKITEM_NOT_FOUND' })
    }

    // opcional: checar se a trip é do user
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId), role: 'admin' } } },
        ],
      },
    })
    if (!trip) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    }

    const updated = await prisma.checkItem.update({
      where: { id: itemId },
      data: { done: !item.done },
    })

    return res.json(updated)
  } catch (err) {
    console.error('toggleCheckItem error', err)
    return res
      .status(400)
      .json({ error: 'TOGGLE_CHECKITEM_FAILED', detail: err.message })
  }
}

// PATCH /trips/:tripId/checklist/:itemId
export async function updateCheckItem(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId, itemId } = req.params
    const { label } = req.body

    if (!label || typeof label !== 'string') {
      return res.status(400).json({ error: 'LABEL_REQUIRED' })
    }

    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId), role: 'admin' } } },
        ],
      },
    })
    if (!trip) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    }

    const item = await prisma.checkItem.findUnique({ where: { id: itemId } })
    if (!item || item.tripId !== tripId) {
      return res.status(404).json({ error: 'CHECKITEM_NOT_FOUND' })
    }

    const updated = await prisma.checkItem.update({
      where: { id: itemId },
      data: { label },
    })

    return res.json(updated)
  } catch (err) {
    console.error('updateCheckItem error', err)
    return res
      .status(400)
      .json({ error: 'UPDATE_CHECKITEM_FAILED', detail: err.message })
  }
}

// DELETE /trips/:tripId/checklist/:itemId
export async function deleteCheckItem(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId, itemId } = req.params

    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId), role: 'admin' } } },
        ],
      },
    })
    if (!trip) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    }

    const item = await prisma.checkItem.findUnique({ where: { id: itemId } })
    if (!item || item.tripId !== tripId) {
      return res.status(404).json({ error: 'CHECKITEM_NOT_FOUND' })
    }

    await prisma.checkItem.delete({ where: { id: itemId } })
    return res.status(204).end()
  } catch (err) {
    console.error('deleteCheckItem error', err)
    return res
      .status(400)
      .json({ error: 'DELETE_CHECKITEM_FAILED', detail: err.message })
  }
}



// POST /trips/:tripId/days
export async function addDay(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId } = req.params
    const { title, from, to, distanceKm, eta, notes } = req.body

    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId), role: 'admin' } } },
        ],
      },
    })
    if (!trip) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    }

    const count = await prisma.day.count({
      where: { tripId },
    })

    const day = await prisma.day.create({
      data: {
        tripId,
        title: title || null,
        from: from || null,
        to: to || null,
        distanceKm: typeof distanceKm === 'number' ? distanceKm : null,
        eta: eta || null,
        notes: notes || null,
        order: count + 1,
      },
    })

    return res.status(201).json(day)
  } catch (err) {
    console.error('addDay error', err)
    return res
      .status(400)
      .json({ error: 'ADD_DAY_FAILED', detail: err.message })
  }
}

// PATCH /trips/:tripId/days/:dayId
export async function updateDay(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId, dayId } = req.params
    const { notes } = req.body

    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId), role: 'admin' } } },
        ],
      },
    })
    if (!trip) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    }

    const day = await prisma.day.update({
      where: { id: dayId },
      data: { notes },
    })

    return res.json(day)
  } catch (err) {
    console.error('updateDay error', err)
    return res
      .status(400)
      .json({ error: 'UPDATE_DAY_FAILED', detail: err.message })
  }
}

// DELETE /trips/:tripId/days/:dayId
export async function deleteDay(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId, dayId } = req.params

    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId), role: 'admin' } } },
        ],
      },
    })
    if (!trip) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    }

    const day = await prisma.day.findFirst({
      where: { id: dayId, tripId },
    })
    if (!day) {
      return res.status(404).json({ error: 'DAY_NOT_FOUND' })
    }

    await prisma.day.delete({ where: { id: dayId } })
    return res.status(204).end()
  } catch (err) {
    console.error('deleteDay error', err)
    return res
      .status(400)
      .json({ error: 'DELETE_DAY_FAILED', detail: err.message })
  }
}

// POST /trips/:tripId/invites
export async function createInvite(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId } = req.params
    const { role, type } = req.body

    if (!['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'INVALID_ROLE' })
    }

    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId), role: 'admin' } } },
        ],
      },
    })

    if (!trip) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    }

    const code = Math.random().toString(36).slice(2, 10)
    const maxUses = type === 'single' ? 1 : null

    const invite = await prisma.accessCode.create({
      data: {
        tripId,
        role,
        code,
        maxUses,
      },
    })

    return res.status(201).json({
      code: invite.code,
      role: invite.role,
      type: type || 'link',
    })
  } catch (err) {
    console.error('createInvite error', err)
    return res
      .status(400)
      .json({ error: 'CREATE_INVITE_FAILED', detail: err.message })
  }
}

// POST /trips/join
export async function joinTripByCode(req, res) {
  try {
    const userId = req.userId ?? 1
    const { code } = req.body

    if (!code) {
      return res.status(400).json({ error: 'CODE_REQUIRED' })
    }

    const invite = await prisma.accessCode.findUnique({
      where: { code },
      include: { trip: true },
    })

    if (!invite) {
      return res.status(404).json({ error: 'INVITE_NOT_FOUND' })
    }

    if (invite.maxUses && invite.usedCount >= invite.maxUses) {
      return res.status(400).json({ error: 'INVITE_ALREADY_USED' })
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(400).json({ error: 'INVITE_EXPIRED' })
    }

    const userIdStr = String(userId)

    await prisma.tripMember.upsert({
      where: {
        tripId_userId: {
          tripId: invite.tripId,
          userId: userIdStr,
        },
      },
      update: { role: invite.role },
      create: {
        tripId: invite.tripId,
        userId: userIdStr,
        role: invite.role,
      },
    })

    if (invite.maxUses) {
      await prisma.accessCode.update({
        where: { id: invite.id },
        data: { usedCount: { increment: 1 } },
      })
    }

    const trip = await prisma.trip.findFirst({
      where: { id: invite.tripId },
      include: {
        checklist: { orderBy: { createdAt: 'asc' } },
        days: { orderBy: { order: 'asc' } },
        members: true,
      },
    })

    const isOwner = trip.createdById === userIdStr
    const member = trip.members.find((m) => m.userId === userIdStr)
    const role = isOwner ? 'admin' : member?.role || 'viewer'
    const canEdit = role === 'admin'

    return res.json({ ...trip, currentRole: role, canEdit })
  } catch (err) {
    console.error('joinTripByCode error', err)
    return res
      .status(400)
      .json({ error: 'JOIN_TRIP_FAILED', detail: err.message })
  }
}

export async function deleteTrip(req, res) {
  try {
    const userId = req.userId ?? 1
    const { tripId } = req.params

    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId), role: 'admin' } } },
        ],
      },
    })
    if (!trip) return res.status(404).json({ error: 'TRIP_NOT_FOUND' })

    await prisma.trip.delete({ where: { id: tripId } })
    return res.status(204).end()
  } catch (err) {
    console.error('deleteTrip error', err)
    return res.status(500).json({ error: 'INTERNAL_ERROR', detail: err.message })
  }
}

export async function exportTripPdf(req, res) {
  try {
    const userId = req.userId ?? 1; const { tripId } = req.params
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { createdById: String(userId) },
          { members: { some: { userId: String(userId) } } },
        ],
      },
      include: {
        checklist: { orderBy: { createdAt: 'asc' } },
        days: { orderBy: { order: 'asc' } },
        members: { include: { user: true } },
      },
    })
    if (!trip) return res.status(404).json({ error: 'TRIP_NOT_FOUND' })
    const doc = new PDFDocument({ margin: 50 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="viagem-${trip.title || 'trip'}.pdf"`,
    )
    doc.pipe(res); buildTripPdf(doc, trip); doc.end()
  } catch (err) {
    console.error('exportTripPdf error', err)
    return res
      .status(500)
      .json({ error: 'EXPORT_TRIP_FAILED', detail: err.message })
  }
}





