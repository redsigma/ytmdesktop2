import { existsSync, mkdirSync } from "fs";
import { access, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { base64 } from "@shared/utils/base64";
import { app, safeStorage } from "electron";
import Encryption from "encryption.js";

const cachePath = join(app.getPath("userData"), "cache");
if (!existsSync(cachePath)) mkdirSync(cachePath);

export async function cacheWithFile<T>(fn: () => Promise<T>, key: string): Promise<T> {
	const cacheFile = join(cachePath, key + ".ytm");
	const exists = await access(cacheFile)
		.then(() => true)
		.catch(() => false);
	const legacyEnc = new Encryption({ secret: base64.encode(key) });

	if (exists) {
		const rawData = await readFile(cacheFile);

		if (safeStorage.isEncryptionAvailable()) {
			try {
				const decrypted = safeStorage.decryptString(rawData);
				return JSON.parse(decrypted);
			} catch {
				// Fall through to legacy decryption.
			}
		}

		try {
			const decrypted = legacyEnc.decrypt(rawData.toString("utf8"));
			if (decrypted) {
				if (safeStorage.isEncryptionAvailable()) {
					await writeFile(cacheFile, safeStorage.encryptString(JSON.stringify(decrypted)));
				}
				return decrypted;
			}
		} catch {
			// Ignore cache corruption and refresh from source.
		}
	}

	const result = (await fn()) as T;
	if (safeStorage.isEncryptionAvailable()) {
		await writeFile(cacheFile, safeStorage.encryptString(JSON.stringify(result)));
	} else {
		await writeFile(cacheFile, legacyEnc.encrypt(result));
	}
	return result;
}
