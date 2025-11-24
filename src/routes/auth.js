import { Router } from 'express'
import { login, register, me } from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'


const router = Router()

router.post('/auth/login', login)
router.post('/auth/register', register)
router.get('/me', requireAuth, me)


export default router
