// middleware/authenticateToken.js
const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Forbidden: Invalid or expired token" });
    }

    req.user = {
      userid: decoded.userid,
      email: decoded.email,
      role: decoded.role,                 // system role (superadmin)
      orgRoles: decoded.orgRoles || {},   // { orgid: "admin" | "editor" | "viewer" }
    };

    // Optional: active org from request header
    req.user.activeOrg = req.headers["x-org-id"] || null;

    next();
  });
}

module.exports = authenticateToken;
