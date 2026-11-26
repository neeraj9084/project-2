// Pure guards are reusable in offline tests and do not connect to MongoDB.
const validateMigrationTarget = ({ uri, dbName, nodeEnv, execute = false, confirmedDb, acknowledged = false } = {}) => {
    if (nodeEnv === "production") throw new Error("Production execution is prohibited");
    if (typeof uri !== "string" || !uri.startsWith("mongodb://")) throw new Error("A local MongoDB URI is required");
    let parsed;
    try { parsed = new URL(uri); } catch { throw new Error("Invalid MongoDB URI"); }
    if (parsed.username || parsed.password || !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
        parsed.host.includes(",") || parsed.searchParams.has("loadBalanced") ||
        parsed.pathname !== `/${dbName}` || !/^test_[a-zA-Z0-9_]+$/.test(dbName || "")) {
        throw new Error("Only a named local test database is allowed");
    }
    if (typeof execute !== "boolean" || (execute && (confirmedDb !== dbName || acknowledged !== true))) {
        throw new Error("Explicit execution authorization and exact database confirmation are required");
    }
    return { dbName, execute };
};

const planExpirationIndexes = (indexes, replacementName, expirationField = "expiresAt") => {
    if (!Array.isArray(indexes) || typeof replacementName !== "string" || !["expiresAt", "verificationOtpExpiry"].includes(expirationField)) throw new Error("Invalid index metadata");
    const replacementKey = { [expirationField]: 1, _id: 1 };
    const ttl = indexes.filter((index) => index.key && Object.keys(index.key).length === 1 &&
        index.key[expirationField] === 1 && Number.isFinite(index.expireAfterSeconds));
    const collision = indexes.find((index) => index.name === replacementName &&
        (index.expireAfterSeconds !== undefined || JSON.stringify(index.key) !== JSON.stringify(replacementKey) ||
            index.partialFilterExpression || index.sparse || index.hidden || index.collation));
    if (collision) throw new Error("Replacement index name conflicts with an existing index");
    return { ttlIndexes: ttl.map((index) => ({ name: index.name, expireAfterSeconds: index.expireAfterSeconds })),
        replacementExists: indexes.some((index) => index.name === replacementName) };
};

export { validateMigrationTarget, planExpirationIndexes };
