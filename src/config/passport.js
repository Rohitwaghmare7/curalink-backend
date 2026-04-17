const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");
const logger = require("../utils/logger");

// Only register Google strategy if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error("No email from Google profile"), null);

          let user = await User.findOne({ email });

          if (user) {
            if (!user.googleId) {
              user.googleId = profile.id;
              user.authProvider = "google";
              user.avatar = profile.photos?.[0]?.value || null;
              await user.save();
            }
            return done(null, user);
          }

          user = await User.create({
            email,
            name: profile.displayName || email.split("@")[0],
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value || null,
            authProvider: "google",
            password: null,
          });

          logger.info(`[Auth] New Google user: ${email}`);
          return done(null, user);
        } catch (err) {
          logger.error(`[Auth] Google OAuth error: ${err.message}`);
          return done(err, null);
        }
      }
    )
  );
  logger.info("[Auth] Google OAuth strategy registered");
} else {
  logger.warn("[Auth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google OAuth disabled");
}

module.exports = passport;
