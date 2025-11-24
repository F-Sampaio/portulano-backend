import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  listTrips,
  createTrip,
  getTrip,
  updateTrip,
  addDay,
  updateDay,
  deleteDay,  
  addChecklistItem,
  toggleCheckItem,
  updateCheckItem,
  deleteCheckItem,
  createInvite,
  joinTripByCode,
  deleteTrip,
} from '../controllers/tripController.js'

const router = Router()

router.use(requireAuth)

router.get('/', listTrips)
router.post('/', createTrip)

router.get('/:tripId', getTrip)
router.patch('/:tripId', updateTrip)

router.post('/:tripId/days', addDay)
router.patch('/:tripId/days/:dayId', updateDay)

router.delete('/:tripId/days/:dayId', deleteDay)

router.post('/:tripId/checklist', addChecklistItem)
router.patch('/:tripId/checklist/:itemId/toggle', toggleCheckItem)
router.patch('/:tripId/checklist/:itemId', updateCheckItem)
router.delete('/:tripId/checklist/:itemId', deleteCheckItem)

router.post('/:tripId/invites', createInvite)
router.post('/join', joinTripByCode)

router.delete('/:tripId', deleteTrip)

export default router
