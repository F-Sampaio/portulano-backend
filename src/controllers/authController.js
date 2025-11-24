import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../prisma.js'

const JWT_SECRET = process.env.JWT_SECRET || 'changeme'

function createToken(userId) {
  return jwt.sign({}, JWT_SECRET, {
    subject: userId.toString(),
    expiresIn: '7d',
  })
}

// POST /auth/register
export async function register(req, res) {
  try {
    const { email, password, name } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: 'email already in use' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
    })

    const token = createToken(user.id)
    return res.json({ token })
  } catch (err) {
    console.error('register error', err)
    return res.status(500).json({ error: 'internal error' })
  }
}

// POST /auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(401).json({ error: 'invalid credentials' })
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: 'invalid credentials' })
    }

    const token = createToken(user.id)
    return res.json({ token })
  } catch (err) {
    console.error('login error', err)
    return res.status(500).json({ error: 'internal error' })
  }
}

// GET /me
export async function me(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, createdAt: true },
    })

    if (!user) {
      return res.status(404).json({ error: 'user not found' })
    }

    return res.json(user)
  } catch (err) {
    console.error('me error', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
