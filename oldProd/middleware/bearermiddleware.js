// middleware/bearermiddleware.js

const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .json({ error: "Forbidden: Invalid or expired token" });
    }

    // 🔥 Map JWT payload to req.user with all necessary fields
    req.user = {
      userid: decoded.userid,
      email: decoded.email,
      username: decoded.username,
      platformRole: decoded.platformRole, // RBAC uses this field
      organizations: decoded.organizations || [],
      currentOrganizationId: decoded.currentOrganizationId || null,
    };

    next();
  });
}

module.exports = authenticateToken;
