const sendSMS = async (message: string) => {
  fetch(`https://ivory-shark-9928.twil.io/sendSMS?message=${message}`).then();
};

enum BackgroundStateKeys {
  intervalId = "intervalId",
  tabId = "tabId",
  askedPrice = "askedPrice"
}

interface IBackgroundState {
  intervalId: number;
  tabId: number;
  askedPrice: number;
}

// Initial state
const backgroundState: IBackgroundState = {
  intervalId: undefined,
  tabId: undefined,
  askedPrice: undefined
};

const updateState = newState => {
  Object.keys(newState).forEach(key => {
    if (backgroundState.hasOwnProperty(key)) {
      backgroundState[key] = newState[key];
    } else {
      throw new Error(
        `Invalid key: ${key}. Please try one of: ${Object.keys(
          backgroundState
        )}`
      );
    }
  });
};

const clearState = (stateKeys: BackgroundStateKeys[] | BackgroundStateKeys) => {
  if (typeof stateKeys == "string") {
    backgroundState[stateKeys as BackgroundStateKeys] = undefined;
    return;
  }
  (<BackgroundStateKeys[]>stateKeys).forEach(key => {
    backgroundState[key] = undefined;
  });
};

const sessionAvailable = (tabId: number, askedPrice?: number) => {
  if (!tabId) {
    return false;
  }

  if (backgroundState.tabId && backgroundState.tabId !== tabId) {
    return false;
  }

  if (
    askedPrice &&
    (backgroundState && backgroundState.askedPrice !== askedPrice)
  ) {
    return false;
  }

  return (
    backgroundState.intervalId &&
    backgroundState.tabId &&
    backgroundState.askedPrice
  );
};

const hydrateContent = (tabId: number) => {
  if (!sessionAvailable(tabId)) {
    throw new Error("Invalid hydration, No valid requests found.");
  }

  chrome.tabs.sendMessage(backgroundState.tabId, {
    autoBuyTask: { price: backgroundState.askedPrice }
  });
};

const waitForHeartbeat = async (tabId: number) => {
  const deferred = new Promise(resolve => {
    const heartbeat = setInterval(() => {
      chrome.tabs.sendMessage(
        tabId,
        {
          heartbeat: true
        },
        isAlive => {
          if (isAlive) {
            clearInterval(heartbeat);
            resolve(isAlive);
            return;
          }
        }
      );
    }, 250);
  });

  return deferred;
};

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    if (sessionAvailable(tabId)) {
      hydrateContent(tabId);
    }
  }
});
// Listen to messages sent from other parts of the extension.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // onMessage must return "true" if response is async.
  let isResponseAsync = false;

  console.log(
    `Recieved request: ${JSON.stringify(
      request,
      null,
      4
    )} | from: ${JSON.stringify(sender, null, 4)}`
  );

  if (request.activeTab) {
    const intervalId = setInterval(() => {
      chrome.tabs.reload(request.activeTab);
    }, 60000);

    console.log(`Started interval: ${intervalId}`);
    updateState({
      tabId: request.activeTab,
      askedPrice: request.askedPrice,
      intervalId: intervalId
    });
  } else if (request.taskReady) {
    sendResponse(
      sessionAvailable(sender.tab.id, request.requestPayload.askedPrice)
    );
  } else if (request.stopTab) {
    console.log(`Stopping buyer: interval: ${backgroundState.intervalId}`);
    clearInterval(backgroundState.intervalId);
    clearState([
      BackgroundStateKeys.intervalId,
      BackgroundStateKeys.tabId,
      BackgroundStateKeys.askedPrice
    ]);
  } else if (request.isPrice) {
    sendResponse(
      backgroundState.askedPrice &&
        request.price &&
        request.price <= backgroundState.askedPrice
    );
  } else if (request.isDone) {
    console.log("sending sms!");
    clearState([
      BackgroundStateKeys.intervalId,
      BackgroundStateKeys.tabId,
      BackgroundStateKeys.askedPrice
    ]);
    clearInterval(backgroundState.intervalId);
    sendSMS(
      `You have sucessfully purchase your item for: ${
        backgroundState.askedPrice
      }`
    );
  }

  return isResponseAsync;
});
