import express from 'express'
import morgan from 'morgan'
import cors from 'cors'
import dotenv from 'dotenv'
import authRouter from './routes/auth.js'
import tripsRouter from './routes/trips.js'
import { prisma } from './prisma.js'


dotenv.config()


const app = express()
app.use(cors())
app.use(express.json())
app.use(morgan('dev'))


app.use(authRouter)
app.use('/trips', tripsRouter)

app.get('/health', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`
        res.json({ ok: true })
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e) })
    }
})


const port = process.env.PORT || 5000
app.listen(port, () => {
console.log(`API running on :${port}`)
})