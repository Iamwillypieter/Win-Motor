import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "Please define the MONGODB_URI environment variable in .env.local"
  );
}

/**
 * Global cache to prevent multiple connections in Next.js dev mode (hot reload).
 * In production, each serverless invocation gets a fresh module scope,
 * but the connection is reused within the same invocation.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Connect to MongoDB using a singleton pattern.
 * Reuses existing connection if available.
 * @returns {Promise<mongoose.Connection>}
 */
async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      // Reconnect logic
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      heartbeatFrequencyMS: 10000,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongooseInstance) => {
        console.log("MongoDB connected successfully");
        // Naikkan maxListeners untuk menghindari warning saat banyak concurrent request
        mongooseInstance.connection.setMaxListeners(50);
        return mongooseInstance;
      })
      .catch((err) => {
        cached.promise = null;
        console.error("MongoDB connection error:", err);
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

// Handle reconnect events — daftarkan hanya sekali menggunakan flag di global
if (!global._mongooseListenersRegistered) {
  global._mongooseListenersRegistered = true;

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected. Attempting to reconnect...");
    cached.conn = null;
    cached.promise = null;
  });

  mongoose.connection.on("reconnected", () => {
    console.log("MongoDB reconnected successfully");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
    cached.conn = null;
    cached.promise = null;
  });
}

export default connectDB;
