const waitOnTaskAsync = async (
  task: () => Promise<any>,
  repeatInterval: number,
  timeoutInMs: number
) => {
  const waitForReady = new Promise(resolve => {
    let timeout: any;

    const waitInterval = setInterval(async () => {
      const res = await task();

      if (res) {
        clearInterval(waitInterval);
        resolve(res);
        return;
      }
    }, repeatInterval);

    timeout = setTimeout(() => {
      clearInterval(waitInterval);
      resolve(null);
      return;
    }, timeoutInMs);
  });

  const taskResult = await waitForReady;
  return taskResult;
};

const getElementByIdAsync = async (
  id: string,
  waitForMs: number,
  doc: Document = document
): Promise<any> => {
  const getElementAsync = () =>
    new Promise(resolve => {
      resolve(doc.getElementById(id));
    });

  return await waitOnTaskAsync(getElementAsync, 100, waitForMs);
};

const sendDoneMessage = () => {
  chrome.runtime.sendMessage({ isDone: true });
};

const waitForReady = async request => {
  const readyUp = () =>
    new Promise(resolve => {
      chrome.runtime.sendMessage(
        { taskReady: true, requestPayload: request },
        isReady => {
          resolve(isReady);
        }
      );
    });

  return await waitOnTaskAsync(readyUp, 150, 5000);
};

const checkPrice = async () => {
  const readyUp = () =>
    new Promise(resolve => {
      chrome.runtime.sendMessage(
        { isPrice: true, price: getPrice() },
        isReady => {
          resolve(isReady);
        }
      );
    });

  return await waitOnTaskAsync(readyUp, 150, 5000);
};

const getPrice = () => {
  const priceEl = document.getElementById("priceblock_ourprice");

  return (priceEl && Number(priceEl.innerText.substr(1))) || Infinity;
};

const getAddToCartButton = () => {
  const cartEl = document.getElementById("add-to-cart-button");

  return cartEl;
};

const isAvailable = responseHandler => {
  const buyBox = document.getElementById("buybox");

  responseHandler(buyBox);
};

const getBuyNowButton = () => {
  return document.getElementById("buy-now-button");
};

const stopBuyer = () => {
  chrome.runtime.sendMessage({ stopTab: true });
};

const setupBuyScreen = (request, responseHandler) => {
  if (document.getElementById("AmazonAutoBuyerId")) {
    throw Error("Buy process already running. Exiting.");
  }
  if (!request.autoBuyTask.price) {
    responseHandler(false);
  }

  if (isNaN(request.autoBuyTask.price)) {
    responseHandler(false);
  }

  const buyScreen = document.createElement("div");
  buyScreen.onclick = () => {
    stopBuyer();
    document.body.removeChild(buyScreen);
  };

  buyScreen.id = "AmazonAutoBuyerId";
  buyScreen.className = "AmazonAutoBuyerFullScreen";

  const buyLabel = document.createElement("p");
  buyLabel.className = "AmazonAutoBuyerLabel";
  buyLabel.innerText = `AutoPurchasing this item for no more than: ${
    request.autoBuyTask.price
  }$. Click anywhere to dismiss this window and stop the autopurchase.`;

  buyScreen.appendChild(buyLabel);
  document.body.appendChild(buyScreen);
  responseHandler(true);
};

const beginBuyer = async (request, responseHandler) => {
  setupBuyScreen(request, responseHandler);

  const isReady = await waitForReady(request);

  if (!isReady) {
    throw new Error(
      "Timeout: Unable to recieve ready from background process."
    );
  }
  const previewPurchase = () => {
    return new Promise(async resolve => {
      const buyNowButton = (await getElementByIdAsync(
        "buy-now-button",
        10000
      )) as HTMLElement;
      if (buyNowButton) {
        buyNowButton.click();
        const turboBuyButtonIframe: HTMLIFrameElement = (await getElementByIdAsync(
          "turbo-checkout-iframe",
          10000
        )) as HTMLIFrameElement;

        if (turboBuyButtonIframe) {
          const doc = turboBuyButtonIframe.contentWindow.document;
          const turboBuyButton = (await getElementByIdAsync(
            "turbo-checkout-pyo-button",
            10000,
            doc
          )) as HTMLElement;

          resolve(turboBuyButton);
          return;
        } else {
          resolve(null);
          return;
        }
      } else {
        resolve(null);
        return;
      }
    });
  };

  const skipPurchaseButton = (): Promise<HTMLElement> =>
    getElementByIdAsync("bottomSubmitOrderButtonId", 10000);

  const longPurchase = () => {
    return new Promise(async resolve => {
      const reviewOrderButton = (await getElementByIdAsync(
        "spcViewButtonId",
        10000
      )) as HTMLElement;

      if (reviewOrderButton) {
        reviewOrderButton.click();
        const purchaseButton = (await skipPurchaseButton()) as HTMLElement;

        if (purchaseButton) {
          resolve(purchaseButton);
          return;
        } else {
          resolve(null);
          return;
        }
      } else {
        resolve(null);
      }
    });
  };

  type HTMLE = HTMLElement | {} | null;

  const purchaseButtons: HTMLE[] = (await Promise.all([
    previewPurchase(),
    skipPurchaseButton(),
    longPurchase()
  ])).filter(button => button);

  if (purchaseButtons.length > 0) {
    const purchaseButton = purchaseButtons[0] as HTMLElement;

    console.log("FOUND BUTTON");
    console.log(purchaseButton);

    const canProceed = await checkPrice();

    if (!!canProceed) {
      console.log("gonna click now");
      purchaseButton.click();
    } else {
      console.log("nah too expensive");
    }

    sendDoneMessage();
  }
};

// Listen to messages sent from other parts of the extension.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // onMessage must return "true" if response is async.
  let isResponseAsync = false;

  if (request.didMount) {
    isAvailable(sendResponse);
  } else if (request.autoBuyTask) {
    console.log("new buy task");
    beginBuyer(request, sendResponse);
  }

  return isResponseAsync;
});
