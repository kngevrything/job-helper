import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/jobtracker";

if (!MONGODB_URI) {
  throw new Error(
    "Please define the MONGODB_URI environment variable inside .env.local"
  );
}

declare global {
    var mongooseConnection: { 
        connection: typeof mongoose | null ;
        promise: Promise<typeof mongoose> | null;
    } | undefined;
}

const cached = global.mongooseConnection ?? {connection: null, promise: null};

global.mongooseConnection = cached;

export async function connectToDatabase() : Promise<typeof mongoose> {
    if (cached.connection) {
    return cached.connection;
    }

    if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {dbName: "jobtracker"});
    }

    cached.connection = await cached.promise;
    return cached.connection

}
