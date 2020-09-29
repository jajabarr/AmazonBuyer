import * as React from "react";
import "./Popup.scss";

interface AppProps {}

interface AppState {
  pageIsAvailable: boolean;
  eventCounter: number;
  askedPrice: number | null;
  tabIndex: number | null;
  shouldShowPriceError: boolean;
}

export default class Popup extends React.Component<AppProps, AppState> {
  constructor(props: AppProps, state: AppState) {
    super(props, state);
    this.state = {
      pageIsAvailable: false,
      eventCounter: 0,
      askedPrice: null,
      tabIndex: null,
      shouldShowPriceError: false
    };
  }
  componentWillMount() {}

  componentDidMount() {
    this.getTabs(tabs => {
      const currentTab = tabs[0];
      if (!currentTab) {
        return;
      }
      const urlIsCorrect = currentTab.url.includes(".amazon.com");

      chrome.tabs.sendMessage(
        currentTab.id,
        { didMount: true },
        isAvailable => {
          this.setState({
            tabIndex: currentTab.id,
            pageIsAvailable: urlIsCorrect && isAvailable
          });
        }
      );
    });
  }

  getTabs = (callback: (tabs: chrome.tabs.Tab[]) => void) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
      callback(tabs);
    });
  };

  handlePriceUpdate = e => {
    console.log(e);

    this.setState({
      askedPrice: e.target.value
    });
  };

  handleAutoBuy = e => {
    e.preventDefault();

    chrome.tabs.sendMessage(
      this.state.tabIndex,
      {
        autoBuyTask: { price: this.state.askedPrice }
      },
      success => {
        if (success) {
          chrome.runtime.sendMessage({
            activeTab: this.state.tabIndex,
            askedPrice: this.state.askedPrice
          });
          window.close();
        } else {
          this.setState({
            shouldShowPriceError: true
          });
        }
      }
    );
  };

  render() {
    return (
      <div className="popupContainer">
        <h1 className="title">AmazonBuyer</h1>
        <div className="statusBox">
          <h2
            className={this.state.pageIsAvailable ? "available" : "unavailable"}
          >
            This page is {this.state.pageIsAvailable ? "" : "not"} available for
            autopurchasing.
          </h2>
        </div>
        <div
          className="interactable"
          style={{
            visibility: this.state.pageIsAvailable ? "visible" : "hidden"
          }}
        >
          <div className="priceBox">
            <p>Don't buy above: </p>
            <input
              type="text"
              value={this.state.askedPrice}
              onChange={this.handlePriceUpdate}
            />
          </div>
          <button className="initiateButton" onClick={this.handleAutoBuy}>
            Begin AutoBuyer
          </button>
          <div className="statusBox">
            <h2
              style={{
                visibility: this.state.shouldShowPriceError
                  ? "visible"
                  : "hidden"
              }}
              className="unavailable"
            >
              You must enter a valid price to begin the autoBuyer
            </h2>
          </div>
        </div>
      </div>
    );
  }
}
