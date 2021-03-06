import { attach, attachTrigger } from "./Listeners.mjs";
import { getDefaultFile, getState } from "./state.mjs";
let tabs, service;

function copyPath(data, relative) {
	const state = getState();
	const { name } = data;
	let url;
	try {
		url = state.paths
			.find((x) => x.name === name)
			.path.replace("/welcome/", "/.welcome/")
			.replace(/^\//, "./");
	} catch (e) {}
	if (!url) {
		console.log("TODO: make Copy Path work with folders!");
		return;
	}
	const path = relative ? url : new URL(url, document.baseURI).href;
	navigator.clipboard
		.writeText(path)
		.then((x) => console.log(`Wrote path to clipboard: ${path}`))
		.catch((e) => {
			console.error(`Error writing path to clipboard: ${path}`);
			console.error(e);
		});
}

function clearLastTab({ tabs, removeTab }) {
	if(!tabs.length) return;
	const lastTab = tabs[tabs.length - 1];
	if (lastTab.changed || lastTab.touched || lastTab.name.includes("Untitled-"))
		return;
	tabs = tabs.filter((t) => t.id !== lastTab.id);
	removeTab(lastTab);
	return { tabs, cleared: lastTab };
}

function getTabsToUpdate(filePath) {
	const name = filePath.split('/').pop();
	const tabsToUpdate = [];
	let foundTab;
	for (var i = 0, len = tabs.length; i < len; i++) {
		if (name === tabs[i].name) {
			foundTab = tabs[i];
		}
		// update: if tab exists and not active, activate it
		if (name === tabs[i].name && !tabs[i].active) {
			tabs[i].active = true;
			tabsToUpdate.push(tabs[i]);
		}
		// update: remove active state from active tab
		if (name !== tabs[i].name && tabs[i].active) {
			delete tabs[i].active;
			tabsToUpdate.push(tabs[i]);
		}
		if (!foundTab) {
		}
	}
	return { foundTab, tabsToUpdate };
}

function triggerCloseTab(event, fileCloseTrigger) {
	let name;
	try {
		name = event.target.dataset.name.trim();
		parent = (event.target.dataset.parent||'').trim();
	} catch (e) {
		console.log("error trying to handle close tab click");
		console.log(e);
	}
	if (!name) {
		return;
	}
	const closedTab = tabs.find((x) => x.name === name && (x.parent||'') === parent);
	const nextTabs = tabs.filter((x) => x.name !== name && (x.parent||'') !== parent);
	const nextTab = closedTab.active
		? (nextTabs[nextTabs.length - 1] || {})
		: (tabs.filter((x) => x.active) || [{}])[0];

	fileCloseTrigger({
		detail: {
			name: closedTab.name,
			path: closedTab.parent,
			next: nextTab.name,
			nextPath: nextTab.parent,
		},
	});
}

const fileCloseHandler = ({ event, updateTab, removeTab }) => {
	const { name, path, next, nextPath } = event.detail;

	const found = tabs.find((x) => x.name === name);
	tabs = tabs.filter((x) => x.name !== name);
	sessionStorage.setItem("tabs/"+(service?.name||''), JSON.stringify(tabs));

	removeTab(found);

	if (!next) {
		return;
	}
	const nextTab = tabs.find(
		(x) => (x.name === next && x.parent === nextPath) || x.systemDocsName === next
	);
	if (!nextTab) {
		return;
	}
	nextTab.active = true;
	sessionStorage.setItem("tabs/"+(service?.name||''), JSON.stringify(tabs));

	updateTab(nextTab);
};

//TODO: move this to the UI
const clickHandler = ({ event, container, triggers }) => {
	if (!container.contains(event.target)) {
		//console.log('did not click any tab container element');
		return;
	}
	if (
		!event.target.classList.contains("tab") &&
		!event.target.classList.contains("close-editor-action")
	) {
		return;
	}

	if (event.target.classList.contains("close-editor-action")) {
		triggerCloseTab(event, triggers["fileClose"]);
		event.preventDefault();
		return;
	}
	const id = event.target.id;
	const foundTab = tabs.find((x) => x.id === id);
	if (
		tabs
			.filter((x) => x.active)
			.map((x) => x.id)
			.includes(id)
	) {
		return;
	}

	//TODO: keep track of the order which tabs are clicked

	// const { tabsToUpdate, foundTab } = getTabsToUpdate(name);
	// tabsToUpdate.map(updateTab);

	triggers["fileSelect"]({
		detail: {
			name: foundTab.name,
		},
	});
};

const fileSelectHandler = ({
	event,
	container,
	initTabs,
	createTab,
	updateTab,
	removeTab,
}) => {
	const { name, changed, parent } = event.detail;
	if(name.includes('system::')){
		tabs = tabs || [];
	}
	if(!tabs) return;
	let systemDocsName;
	if (name.includes("system::")) {
		systemDocsName = {
			"add-service-folder": "Open Folder",
			"connect-service-provider": "Connect to a Provider",
			"open-previous-service": "Open Previous Service",
			"open-settings-view": "Settings",
		}[name.replace("system::", "")];
	}
	let id = "TAB" + Math.random().toString().replace("0.", "");

	let { tabsToUpdate, foundTab } = getTabsToUpdate(name);
	if (foundTab) {
		tabsToUpdate.map(updateTab);
		sessionStorage.setItem("tabs/"+(service?.name||''), JSON.stringify(tabs));
		return;
	}

	createTab({
		name,
		parent,
		active: true,
		id,
		changed,
	});
	const shouldClearTab = !name.includes("Untitled-");

	const { cleared, tabs: newTabs } = (shouldClearTab && clearLastTab({
		tabs, removeTab 
	})) || {};
	if (newTabs) tabs = newTabs;
	if (cleared) tabsToUpdate = tabsToUpdate.filter((t) => t.id !== cleared.id);
	tabsToUpdate.map(updateTab);
	tabs.push({
		name,
		parent,
		systemDocsName,
		active: true,
		id,
		changed,
	});
	sessionStorage.setItem("tabs/"+(service?.name||''), JSON.stringify(tabs));
};

const fileChangeHandler = ({
	event,
	container,
	initTabs,
	createTab,
	updateTab,
	removeTab,
}) => {
	const { filePath } = event.detail;
	const { foundTab } = getTabsToUpdate(filePath);
	if (!foundTab) {
		console.error(`Could not find a tab named ${filePath} to update`);
		return;
	}
	foundTab.changed = true;
	[foundTab].map(updateTab);
	sessionStorage.setItem("tabs/"+(service?.name||''), JSON.stringify(tabs));
};

const operationDoneHandler = ({
	event,
	container,
	initTabs,
	createTab,
	updateTab,
	removeTab,
}) => {
	const { op, id, result = [] } = event.detail || "";
	if (op === "update") {
		tabs.forEach((t) => {
			if (t.changed) t.touched = true;
			delete t.changed;
		});
		tabs.map(updateTab);
		sessionStorage.setItem("tabs/"+(service?.name||''), JSON.stringify(tabs));
		return;
	}

	if (op !== "read" || !id) {
		return;
	}
	service = result[0];
	const tabsStorageKey = service?.treeState?.select
		? "tabs/"+(service?.name||'')
		: "tabs/";
	const storedTabs = JSON.parse(sessionStorage.getItem(tabsStorageKey) || '[]');
	tabs = [...storedTabs, ...(tabs||[]).filter(x => x.systemDocsName)];
	initTabs(tabs);
};

const contextMenuHandler = ({ event, showMenu }) => {
	const editorDom = document.querySelector("#editor-tabs-container");
	if (!editorDom.contains(event.target)) {
		return true;
	}
	event.preventDefault();

	const tabBarClicked = event.target.id === "editor-tabs";
	const theTab =
		!tabBarClicked && event.target.classList.contains("tab")
			? event.target
			: undefined;
	const theTabId = theTab && theTab.id;
	const tab = theTab && tabs.find((x) => x.id === theTabId);
	// TODO: maybe these should be defined in UI Module
	// filter actions based on whether tab was found or not
	const barClickItems = [{ name: "Close All", disabled: true }];
	const multiTabsItems = [
		"Close",
		{ name: "Close Others", disabled: true },
		{ name: "Close All", disabled: true },
		"-------------------",
		"Copy Path",
		"Copy Relative Path",
		"-------------------",
		"Reveal in Side Bar",
		"-------------------",
		{ name: "Keep Open", disabled: true },
		{ name: "Pin", disabled: true },
	];
	const tabClickItems = [
		"Close",
		"-------------------",
		"Copy Path",
		"Copy Relative Path",
		"-------------------",
		"Reveal in Side Bar",
		"-------------------",
		{ name: "Keep Open", disabled: true },
		{ name: "Pin", disabled: true },
	];

	const listItems = (tab
		? tabs.length > 1
			? multiTabsItems
			: tabClickItems
		: barClickItems
	).map((x) =>
		x === "-------------------"
			? "seperator"
			: typeof x === "string"
			? { name: x, disabled: false }
			: x
	);
	let data;
	try {
		data = { tab };
	} catch (e) {}

	if (!data) {
		console.error("some issue finding data for this context click!");
		return;
	}

	showMenu()({
		x: event.clientX,
		y: event.clientY,
		list: listItems,
		parent: "Tab Bar",
		data,
	});
	return false;
};

const contextMenuSelectHandler = ({ event, triggers }) => {
	const { which, parent, data } = event.detail || {};
	if (parent !== "Tab Bar") return;
	const NOT_IMPLEMENTED = (fn) => () =>
		setTimeout(() => alert(fn + ": not implemented"), 0);
	const handler = {
		close: ({ tab }) => triggers.fileClose({ detail: tab }),
		closeothers: NOT_IMPLEMENTED("closeothers"),
		closeall: NOT_IMPLEMENTED("closeall"),
		copypath: ({ tab }) => copyPath(tab),
		copyrelativepath: ({ tab }) => copyPath(tab, "relative"),
		revealinsidebar: ({ tab }) => {
			triggers.fileSelect({ detail: tab });
			document.getElementById("explorer").focus();
		},
		keepopen: NOT_IMPLEMENTED("keepopen"),
		pin: NOT_IMPLEMENTED("pin"),
	}[which.toLowerCase().replace(/ /g, "")];

	handler && handler(data);
};

const systemDocsHandler = ({
	event,
	container,
	initTabs,
	createTab,
	updateTab,
	removeTab,
}) => {
	const systemDocsTabEvent = {
		detail: {
			name: `system::` + event.type,
		},
	};
	fileSelectHandler({
		event: systemDocsTabEvent,
		container,
		initTabs,
		createTab,
		updateTab,
		removeTab,
	});
};

const uiHandler = ({ event, triggers, updateTab }) => {
	const { fileSelect } = triggers;
	const { detail } = event;
	const { operation } = detail;
	const doHandle = {
		prevDocument: () => {
			// TODO: determine what tab is previous
			// fileSelect it
			console.warn("prevDocument: not implemented!");
		},
		nextDocument: () => {
			// TODO: determine what tab is next
			// fileSelect it
			console.warn("nextDocument: not implemented!");
		},
	}[operation];
	if (!doHandle) return;
	doHandle();
};

const handlers = {
	ui: uiHandler,
	click: clickHandler,
	fileSelect: fileSelectHandler,
	fileClose: fileCloseHandler,
	fileChange: fileChangeHandler,
	operationDone: operationDoneHandler,
	contextmenu: contextMenuHandler,
	"contextmenu-select": contextMenuSelectHandler,
	"add-service-folder": systemDocsHandler,
	"connect-service-provider": systemDocsHandler,
	"open-previous-service": systemDocsHandler,
	"open-settings-view": systemDocsHandler,
};

function attachListener(
	container,
	{ initTabs, createTab, updateTab, removeTab }
) {
	const triggers = {
		fileClose: attachTrigger({
			name: "Tab Bar",
			eventName: "fileClose",
			type: "raw",
		}),
		fileSelect: attachTrigger({
			name: "Tab Bar",
			eventName: "fileSelect",
			type: "raw",
		}),
		addFileUntracked: attachTrigger({
			name: "Tab Bar",
			eventName: "operations",
			type: "raw",
			data: {
				operation: "addFile",
				untracked: true,
			},
		}),
	};

	const listener = async function (event) {
		const showMenu = () => window.showMenu;

		handlers[event.type] &&
			handlers[event.type]({
				event,
				container,
				initTabs,
				createTab,
				updateTab,
				removeTab,
				showMenu,
				triggers,
			});
	};

	attach({
		name: "Tab Bar",
		eventName: "ui",
		listener,
	});

	attach({
		name: "Tab Bar",
		eventName: "open-settings-view",
		listener,
	});
	attach({
		name: "Tab Bar",
		eventName: "add-service-folder",
		listener,
	});
	attach({
		name: "Tab Bar",
		eventName: "open-previous-service",
		listener,
	});
	attach({
		name: "Tab Bar",
		eventName: "connect-service-provider",
		listener,
	});

	attach({
		name: "Tab Bar",
		eventName: "operationDone",
		listener,
	});

	attach({
		name: "Tab Bar",
		eventName: "fileSelect",
		listener,
	});

	attach({
		name: "Tab Bar",
		eventName: "fileClose",
		listener,
	});

	attach({
		name: "Tab Bar",
		eventName: "fileChange",
		listener,
	});

	attach({
		name: "Tab Bar",
		eventName: "click",
		listener,
	});

	attach({
		name: "Tab Bar",
		eventName: "contextmenu",
		listener,
	});

	attach({
		name: "Tab Bar",
		eventName: "contextmenu-select",
		listener,
	});

	return triggers;
}

export { attachListener };
