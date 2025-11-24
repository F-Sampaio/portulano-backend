import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'changeme'

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''

  const [scheme, token] = authHeader.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'UNAUTHORIZED' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.sub
    return next()
  } catch (err) {
    console.error('JWT verify error', err)
    return res.status(401).json({ error: 'INVALID_TOKEN' })
  }
}
