import { ipcRenderer } from 'electron';

const parseQueryString = (str: string): Record<string, string> => {
	const query = str.includes("?") ? str.split("?")[1] : str;
	return Object.fromEntries(new URLSearchParams(query).entries());
};

const waitForElement = (selector: string): Promise<Element> => {
	return new Promise((resolve) => {
		const el = document.querySelector(selector);
		if (el) { resolve(el); return; }
		const observer = new MutationObserver(() => {
			const found = document.querySelector(selector);
			if (found) { resolve(found); observer.disconnect(); }
		});
		observer.observe(document.body, { childList: true, subtree: true });
	});
};

const automateCompHost = async (params: Record<string, string>): Promise<void> => {
	(window as any).openHostWindow(false, 1);
	await waitForElement(".hostTb0");
	let mapCheckbox = document.querySelector(`#${params.mapId}`) as HTMLInputElement | null;

	if (!mapCheckbox) {
		const allMapNameElements = document.querySelectorAll(".hostMap .hostMapName");
		const targetNameElement = Array.from(allMapNameElements).find(
			(el) => (el as HTMLElement).innerText.trim().toLowerCase() === params.mapId.toLowerCase(),
		);
		if (targetNameElement) mapCheckbox = targetNameElement.parentElement!.querySelector('input[type="checkbox"]');
	}

	if (!mapCheckbox) return;
	if (!mapCheckbox.checked) mapCheckbox.click();

	(window as any).windows[7].switchTab(2);

	const team1Input = await waitForElement("#customSnameTeam1") as HTMLInputElement;
	team1Input.value = params.team1Name;
	const team2Input = await waitForElement("#customSnameTeam2") as HTMLInputElement;
	team2Input.value = params.team2Name;

	const teamSizeSelect = await waitForElement("#customStmSize") as HTMLSelectElement;

	const teamSizeMap: Record<string, string> = {
		"1v1": "0",
		"2v2": "1",
		"3v3": "2",
		"4v4": "3",
	};

	if (params.team1Players) {
		const compRosterT1 = await waitForElement("#compRosterT1") as HTMLInputElement;
		compRosterT1.value = params.team1Players;
	}
	if (params.team2Players) {
		const compRosterT2 = await waitForElement("#compRosterT2") as HTMLInputElement;
		compRosterT2.value = params.team2Players;
	}
	if (params.spectators) {
		const compSpectators = await waitForElement("#compRosterSpecs") as HTMLInputElement;
		compSpectators.value = params.spectators;
	}

	const customSspecSlots = await waitForElement("#customSspecSlots") as HTMLInputElement;
	customSspecSlots.value = "4";

	const gunMap = [
		"ak",
		"sniper",
		"smg",
		"lmg",
		"shotgun",
		"rev",
		"semi",
		"rpg",
		"uzi",
		"runner",
		"deagler",
		"crossbow",
		"famas",
		"blaster",
		"survivor",
		"infiltrator",
	];

	if (params.classes) {
		try {
			const classes = JSON.parse(params.classes);
			for (const [gunName, limit] of Object.entries(classes)) {
				const id = gunMap.indexOf(gunName);
				const element = await waitForElement(`#customSclassLim${id}`) as HTMLInputElement;
				element.value = String(limit);
			}
		} catch { /* ignore */ }
	}

	const finalTeamSize = teamSizeMap[params.teamSize] || params.teamSize;
	teamSizeSelect.value = finalTeamSize;

	if (params.webhook) {
		try {
			const webhookInput = await waitForElement("#customSwebhook") as HTMLInputElement;
			webhookInput.value = decodeURIComponent(params.webhook);
		} catch { /* ignore */ }
	}
	(window as any).createPrivateRoom();
};


const changeRegion = async (region: string): Promise<void> => {
	const regionMap: Record<string, string> = {
		FRA: "de-fra",
		SV: "us-ca-sv",
		SYD: "au-syd",
		TOK: "jb-hnd",
		SIN: "sgp",
		NY: "us-nj",
		MUM: "as-mb",
		DAL: "us-tx",
		BR: "brz",
		ME: "me-bhn",
	};

	const normalizedRegion = regionMap[region.toUpperCase()] || region;

	(window as any).showWindow(1);

	const selectRoot = document.querySelector("select.inputGrey2") as HTMLSelectElement | null;
	if (!selectRoot) {
		if (typeof (window as any).setSetting === "function") {
			(window as any).setSetting("defaultRegion", normalizedRegion);
		}
		return;
	}

	const regionValues = Object.values(regionMap);
	const regionSelect =
		(Array.from(document.querySelectorAll("select.inputGrey2")).find((select) =>
			Array.from((select as HTMLSelectElement).options).some((opt) => regionValues.includes(opt.value)),
		) as HTMLSelectElement | undefined) || selectRoot;

	if (regionSelect && regionSelect.value !== normalizedRegion) {
		const optionIndex = Array.from(regionSelect.options).findIndex((opt) => opt.value === normalizedRegion);
		if (optionIndex !== -1) {
			regionSelect.selectedIndex = optionIndex;
			regionSelect.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
		}
	}

	(window as any).showWindow(1);
};

const checkPendingHost = (): void => {
	const pendingParams = sessionStorage.getItem("pendingCompHost");
	if (!pendingParams) return;
	sessionStorage.removeItem("pendingCompHost");
	try {
		const params = JSON.parse(pendingParams);
		console.log('[KCC] Protocol: pending host params found, executing...');
		const poll = setInterval(() => {
			const w = window as any;
			if (w.openHostWindow && w.windows?.[7] && w.createPrivateRoom) {
				clearInterval(poll);
				automateCompHost(params).catch((err) => console.error('[KCC] Protocol: auto host failed:', err));
			}
		}, 500);
		setTimeout(() => clearInterval(poll), 30000);
	} catch (err) {
		console.error('[KCC] Protocol: invalid pending params:', err);
	}
};

const parseArgs = async (args: string): Promise<void> => {
	const parts = args.split(" ");
	for (const arg of parts) {
		if (arg.includes("action=host-comp")) {
			const params = parseQueryString(arg);
			if (params.region) {
				sessionStorage.setItem("pendingCompHost", JSON.stringify(params));
				await changeRegion(params.region);
				window.location.href = "https://krunker.io/";
			} else {
				await automateCompHost(params);
			}
		}
	}
};

export function initKccProtocol(): void {
	(window as any).kcc.parseArgs = parseArgs;

	ipcRenderer.on("kcc-protocol", (_event, url: string) => {
		console.log('[KCC] Protocol URL received:', url);
		parseArgs(url).catch((err) => console.error('[KCC] Protocol: parseArgs failed:', err));
	});

	ipcRenderer.on("main_did-finish-load", () => {
		if (window.location.pathname === "/" || window.location.pathname === "") {
			checkPendingHost();
		}
	});
}