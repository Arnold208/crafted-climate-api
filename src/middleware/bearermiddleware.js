// middleware/bearermiddleware.js

const jwt = require("jsonwebtoken");
const User = require("../models/user/userModel");

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

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .json({ error: "Forbidden: Invalid or expired token" });
    }

    try {
      // System-wide suspension check: Fetch user from DB
      const user = await User.findOne({ userid: decoded.userid }).select('deletedAt role platformRole organizations currentOrganizationId email username firstName lastName');

      if (!user) {
        return res.status(401).json({ error: "Unauthorized: User not found" });
      }

      if (user.deletedAt) {
        return res.status(403).json({
          error: "Account Suspended: Your account has been suspended. Please contact support."
        });
      }

      // Was: firstName: user.firstName ... (Syntax Error)
      // Removed orphaned lines.

      // 5. ATTACH USER
      req.user = user;
      req.token = token;

      next();
    } catch (dbError) {
      console.error("Auth Middleware Error:", dbError);
      return res.status(500).json({ error: "Internal Server Error during authentication" });
    }
  });
}

module.exports = authenticateToken;
