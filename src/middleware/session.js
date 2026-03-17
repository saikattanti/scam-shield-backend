const { getPrismaClient } = require('../utils/prisma');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Session expiry time: 48 hours
const SESSION_EXPIRY_HOURS = 48;

// Middleware to handle session management
async function sessionMiddleware(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const sessionKey = req.cookies.scamshield_session;
    
    if (sessionKey) {
      // Try to find existing session
      const session = await prisma.session.findUnique({
        where: { sessionKey },
        include: { user: true }
      });
      
      if (session && new Date(session.expiresAt) > new Date()) {
        // Valid session - extend expiry (sliding window)
        const newExpiryDate = new Date();
        newExpiryDate.setHours(newExpiryDate.getHours() + SESSION_EXPIRY_HOURS);
        
        await prisma.session.update({
          where: { id: session.id },
          data: { expiresAt: newExpiryDate }
        });
        
        req.user = session.user;
        req.session = session;
        return next();
      }
    }
    
    // No valid session - create guest user and session
    const newSessionKey = uuidv4();
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + SESSION_EXPIRY_HOURS);
    
    const user = await prisma.user.create({
      data: {
        isGuest: true
      }
    });
    
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        sessionKey: newSessionKey,
        expiresAt: expiryDate
      },
      include: { user: true }
    });
    
    // Set cookie
    res.cookie('scamshield_session', newSessionKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRY_HOURS * 60 * 60 * 1000 // 48 hours in milliseconds
    });
    
    req.user = session.user;
    req.session = session;
    next();
  } catch (error) {
    console.error('Session middleware error:', error.message);
    // Continue without session on error - fallback to guest mode
    req.user = null;
    req.session = null;
    next();
  }
}

// Hash content for privacy
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Get content preview (first 100 chars)
function getContentPreview(content) {
  return content.length > 100 ? content.substring(0, 100) + '...' : content;
}

// Cleanup expired sessions (to be called periodically)
async function cleanupExpiredSessions() {
  try {
    const prisma = getPrismaClient();
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
    console.log(`Cleaned up ${result.count} expired sessions`);
    return result.count;
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    throw error;
  }
}

module.exports = {
  sessionMiddleware,
  hashContent,
  getContentPreview,
  cleanupExpiredSessions,
  SESSION_EXPIRY_HOURS
};
