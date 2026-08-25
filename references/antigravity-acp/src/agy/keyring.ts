import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface AntigravityOAuthConfig {
	access_token?: string;
	token_type?: string;
	refresh_token?: string;
	expiry_date?: number | string;
	expiry?: string;
	scope?: string;
	id_token?: string;
	client_id?: string;
	token?: {
		access_token?: string;
		token_type?: string;
		refresh_token?: string;
		expiry?: string;
	};
	auth_method?: string;
}

export async function setupKeyringAndAuth(): Promise<void> {
	console.error("[agy-acp] setupKeyringAndAuth starting...");

	let authRaw =
		process.env.ANTIGRAVITY_AUTH_JSON || process.env.GEMINI_OAUTH_JSON;

	if (!authRaw) {
		// Scan all env vars for OAuth JSON
		for (const [k, v] of Object.entries(process.env)) {
			if (v && v.trim().startsWith("{") && v.includes("refresh_token")) {
				authRaw = v;
				console.error(`[agy-acp] Found OAuth credentials in env var: ${k}`);
				break;
			}
		}
	}

	if (!authRaw) {
		// Try fetching secret from agent-server local HTTP API
		const ports = [18000, 8000];
		for (const p of ports) {
			for (const secretName of ["ANTIGRAVITY_AUTH_JSON", "GEMINI_OAUTH_JSON"]) {
				try {
					const res = await fetch(`http://127.0.0.1:${p}/api/settings/secrets/${secretName}`, {
						headers: { Accept: "application/json" },
					});
					if (res.ok) {
						const body = await res.json();
						const val =
							typeof body === "string"
								? body
								: body?.value || body?.secret || body?.token || "";
						if (val && typeof val === "string" && val.trim().startsWith("{")) {
							authRaw = val.trim();
							console.error(`[agy-acp] Successfully fetched ${secretName} from agent-server API on port ${p}`);
							break;
						}
					}
				} catch {}
			}
			if (authRaw) break;
		}
	}

	if (!authRaw) {
		// Check candidate files on disk
		const candidateFiles = [
			path.join(os.homedir(), ".gemini", "oauth_creds.json"),
			path.join(os.homedir(), ".gemini", "antigravity-cli", "oauth_creds.json"),
			"/home/openhands/.gemini/oauth_creds.json",
			"/home/openhands/.gemini/antigravity-cli/oauth_creds.json",
			"/root/.gemini/oauth_creds.json",
		];
		for (const cf of candidateFiles) {
			try {
				if (fs.existsSync(cf)) {
					const content = fs.readFileSync(cf, "utf8");
					if (content.trim().startsWith("{") && content.includes("refresh_token")) {
						authRaw = content;
						console.error(`[agy-acp] Found OAuth credentials on disk: ${cf}`);
						break;
					}
				}
			} catch {}
		}
	}

	if (!authRaw || !authRaw.trim().startsWith("{")) {
		console.error("[agy-acp] No OAuth credentials found in env, API, or disk!");
		return;
	}

	let parsed: AntigravityOAuthConfig;
	try {
		parsed = JSON.parse(authRaw.trim());
	} catch (e) {
		console.error("[agy-acp] failed to parse auth JSON:", e);
		return;
	}

	const accessToken =
		parsed.token?.access_token || parsed.access_token || "";
	const refreshToken =
		parsed.token?.refresh_token || parsed.refresh_token || "";
	const tokenType =
		parsed.token?.token_type || parsed.token_type || "Bearer";
	const expiry =
		parsed.token?.expiry ||
		(typeof parsed.expiry_date === "number"
			? new Date(parsed.expiry_date).toISOString()
			: typeof parsed.expiry_date === "string"
				? parsed.expiry_date
				: parsed.expiry ||
					new Date(Date.now() + 3600 * 1000 * 24 * 7).toISOString());

	const keyringPayloadObj = {
		token: {
			access_token: accessToken,
			token_type: tokenType,
			refresh_token: refreshToken,
			expiry: expiry,
		},
		auth_method: parsed.auth_method || "consumer",
	};

	const keyringPayloadStr =
		"go-keyring-base64:" +
		Buffer.from(JSON.stringify(keyringPayloadObj)).toString("base64");

	const clientId =
		parsed.client_id ||
		"1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";

	const adcObj = {
		type: "authorized_user",
		client_id: clientId,
		client_secret: "",
		refresh_token: refreshToken,
	};

	// 1. Materialize to all standard filesystem paths
	const homes = [
		os.homedir(),
		process.env.HOME,
		"/home/openhands",
		"/root",
	].filter(Boolean) as string[];

	for (const h of homes) {
		const targetPaths = [
			path.join(h, ".gemini", "oauth_creds.json"),
			path.join(h, ".gemini", "credentials.json"),
			path.join(h, ".gemini", "antigravity-cli", "oauth_creds.json"),
			path.join(h, ".gemini", "antigravity-cli", "credentials.json"),
			path.join(h, ".gemini", "antigravity", "oauth_creds.json"),
			path.join(h, ".gemini", "antigravity", "credentials.json"),
			path.join(h, ".config", "gemini", "oauth_creds.json"),
			path.join(h, ".config", "antigravity", "oauth_creds.json"),
		];

		for (const p of targetPaths) {
			try {
				fs.mkdirSync(path.dirname(p), { recursive: true });
				fs.writeFileSync(p, JSON.stringify(keyringPayloadObj, null, 2), {
					mode: 0o600,
				});
			} catch {}
		}

		// Also materialize ADC
		const adcPaths = [
			path.join(h, ".config", "gcloud", "application_default_credentials.json"),
			path.join(h, ".gcloud", "application_default_credentials.json"),
		];
		for (const p of adcPaths) {
			try {
				fs.mkdirSync(path.dirname(p), { recursive: true });
				fs.writeFileSync(p, JSON.stringify(adcObj, null, 2), {
					mode: 0o600,
				});
			} catch {}
		}
	}

	const mainAdc = path.join(
		os.homedir(),
		".config",
		"gcloud",
		"application_default_credentials.json",
	);
	process.env.GOOGLE_APPLICATION_CREDENTIALS = mainAdc;

	// 2. On Linux, ensure D-Bus and Secret Service daemon are running and populate them
	if (process.platform === "linux") {
		try {
			// Start D-Bus session bus if missing
			if (!process.env.DBUS_SESSION_BUS_ADDRESS) {
				try {
					const dbusOut = child_process
						.execSync("dbus-launch --sh-syntax", { encoding: "utf8" })
						.trim();
					for (const line of dbusOut.split("\n")) {
						const match = line.match(/^([^=]+)='?(.*?)'?;?$/);
						if (match && match[1] && match[2]) {
							process.env[match[1]] = match[2];
						}
					}
					console.error(`[agy-acp] DBUS_SESSION_BUS_ADDRESS=${process.env.DBUS_SESSION_BUS_ADDRESS}`);
				} catch (err) {
					console.error("[agy-acp] dbus-launch error:", err);
				}
			}

			// Start gnome-keyring-daemon
			try {
				child_process.execSync(
					'echo "" | gnome-keyring-daemon --daemonize --unlock --components=secrets 2>/dev/null || true',
					{ stdio: "ignore", env: process.env },
				);
			} catch {}

			// Inject using Python secretstorage or secret-tool
			const pyScript = `
import sys, os
try:
    import secretstorage
    bus = secretstorage.dbus_init()
    collection = secretstorage.get_default_collection(bus)
    if collection.is_locked():
        collection.unlock()
    payload = os.environ.get("KEYRING_PAYLOAD", "")
    for svc in ["antigravity", "gemini"]:
        for user in [svc, "", "consumer", "default"]:
            try:
                collection.create_item(svc, {"service": svc, "username": user}, payload.encode("utf-8"), replace=True)
            except Exception as item_err:
                print(f"item_err: {item_err}", file=sys.stderr)
    print("PYTHON_KEYRING_SUCCESS")
except Exception as e:
    print(f"PYTHON_KEYRING_ERR: {e}", file=sys.stderr)
`;
			const pyRes = child_process.spawnSync("python3", ["-c", pyScript], {
				env: { ...process.env, KEYRING_PAYLOAD: keyringPayloadStr },
				encoding: "utf8",
			});

			console.error(`[agy-acp] python keyring output: stdout=${pyRes.stdout?.trim()}, stderr=${pyRes.stderr?.trim()}`);

			// Fallback / supplement with secret-tool CLI
			const serviceCombos = [
				["antigravity", "antigravity"],
				["antigravity", ""],
				["antigravity", "consumer"],
				["gemini", "gemini"],
				["gemini", ""],
			];
			for (const [service, user] of serviceCombos) {
				try {
					child_process.execSync(
						`echo -n "${keyringPayloadStr}" | secret-tool store --label="${service}" service "${service}" username "${user}" 2>/dev/null || true`,
						{ env: process.env, shell: "/bin/bash" },
					);
				} catch {}
			}
		} catch (err) {
			console.error("[agy-acp] Keyring setup error:", err);
		}
	}
}
