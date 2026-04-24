const jwt = require('jsonwebtoken');
const { Admin } = require('../models');

async function adminAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET || 'admin-secret');

    const admin = await Admin.findByPk(decoded.id);
    if (!admin || !admin.is_active) {
      return res.status(401).json({ error: 'Invalid or disabled account' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.admin?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { adminAuth, requireRole };
