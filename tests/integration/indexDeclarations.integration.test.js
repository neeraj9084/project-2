import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";

test("isolated database accepts declared model indexes", { skip: !process.env.TEST_MONGODB_URI && "TEST_MONGODB_URI is not configured" }, async (t) => {
    const owned = await openTestDatabase();
    try {
        for (const name of fs.readdirSync(new URL("../../src/models/", import.meta.url)).filter((file) => file.endsWith(".model.js"))) {
            await import(`../../src/models/${name}`);
        }
        let count = 0, indexes = 0;
        for (const model of Object.values(mongoose.models)) {
            await model.createCollection(); await model.createIndexes();
            const actual = await model.collection.indexes(); count++;
            for (const [key, options] of model.schema.indexes()) {
                const textFields = Object.entries(key).filter(([, type]) => type === "text").map(([field]) => field).sort();
                assert.ok(actual.some((index) => (textFields.length ? index.key?._fts === "text" &&
                    JSON.stringify(Object.keys(index.weights || {}).sort()) === JSON.stringify(textFields) : JSON.stringify(index.key) === JSON.stringify(key)) &&
                    Boolean(index.unique) === Boolean(options.unique) && Boolean(index.sparse) === Boolean(options.sparse) &&
                    (options.expireAfterSeconds === undefined || index.expireAfterSeconds === options.expireAfterSeconds) &&
                    (!options.name || index.name === options.name) &&
                    (!options.partialFilterExpression || JSON.stringify(index.partialFilterExpression) === JSON.stringify(options.partialFilterExpression))), `${model.modelName}: declared index missing or inconsistent`);
                indexes++;
            }
        }
        t.diagnostic(`checked ${indexes} declared indexes across ${count} models`);
    } finally { await closeTestDatabase(owned); }
});
