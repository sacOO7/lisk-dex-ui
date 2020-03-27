import React from "react";
import "./App.css";

import Orderbook from "./Orderbook";
import Chart from "./Chart";
import PlaceOrder from "./PlaceOrder";
import YourOrders from "./YourOrders";
import SignInModal from "./SignInModal";
import SignInState from "./SignInState";
import { getOrderbook, getClient } from "./API";
import MarketList from "./MarketList";
import { userContext } from './context';
import * as cryptography from "@liskhq/lisk-cryptography";
import * as passphrase from "@liskhq/lisk-passphrase";
import LeaveWarning from "./LeaveWarning";
import { processConfiguration, defaultConfiguration } from "./util/Configuration";

// get what we're actually using from the passphrase library.
const { Mnemonic } = passphrase;

class App extends React.Component {
  constructor(props) {
    super(props);
    // This state has too many members. This is because we want to share data from API calls with various different components without
    // having to re-fetch the data in each.
    this.state = {
      configurationLoaded: false,
      configuration: {},
      orderBookData: { orders: [], bids: [], asks: [], maxSize: { bid: 0, ask: 0 } },
      activeAssets: [],
      // new, activeMarket string for selecting the active market out of the configuration object.
      activeMarket: '',
      enabledAssets: [],
      displaySigninModal: false,
      signedIn: false,
      signInFailure: false,
      displayLeaveWarning: false,
      maxBid: 0,
      minAsk: 0,
      myOrders: [],
      // to prevent cross-chain replay attacks, the user can specify a key for each chain that they are trading on.
      // the address will be used when the asset is being used as the destination chain.
      keys: {
        /*
        'lsk': {
          passphrase: '',
          address: ''
        },
        'lsh': {
          passphrase: '',
          address: ''
        },
        */
      }
    };


    this.showSignIn = this.showSignIn.bind(this);
    this.intervalRegistered = false;
    this.passphraseSubmit = this.passphraseSubmit.bind(this);
    this.loadConfiguration();
  }

  loadConfiguration = async () => {
    const configuration = await processConfiguration(defaultConfiguration);
    const marketSymbols = Object.keys(configuration.markets);
    const defaultMarketKey = marketSymbols[0];
    this.setState({
      configuration,
      activeMarket: defaultMarketKey,
      activeAssets: configuration.markets[defaultMarketKey].assets,
      enabledAssets: Object.keys(configuration.assets),
      configurationLoaded: true
    });
  }

  refreshOrderbook = async () => {
    //console.log('refreshing orderbook');
    getOrderbook(getClient(this.state.configuration.markets[this.state.activeMarket].dexApiUrl)).then(results => {
      const bids = [];
      const asks = [];
      let maxSize = { bid: 0, ask: 0 };
      let myOrders = [];
      for (let result of results.data) {
        if (result.side === "bid") {
          bids.push(result);
          if (result.value > maxSize.bid) {
            maxSize.bid = result.valueRemaining;
          }
          if (result.senderId === this.state.keys[this.state.activeAssets[1]]?.address) {
            myOrders.push(result);
          }
        } else if (result.side === "ask") {
          asks.push(result);
          if (result.size > maxSize.ask) {
            maxSize.ask = result.sizeRemaining;
          }
          if (result.senderId === this.state.keys[this.state.activeAssets[0]]?.address) {
            myOrders.push(result);
          }
        }
      }
      //console.log('my orders');
      //console.log(myOrders);
      let maxBid = 0;
      let minAsk = 0;
      if (bids.length > 0) {
        maxBid = bids[bids.length - 1].price;
      }
      if (asks.length > 0) {
        minAsk = asks[0].price;
      }
      this.setState({ orderBookData: { bids, asks, maxSize }, maxBid, minAsk, myOrders });
    });
  }

  componentDidMount() {
    // Enable navigation prompt
    window.onbeforeunload = (e) => {
      //this.setDisplayLeaveWarning(true);
      //e.preventDefault();
      //return true;
    };
  }

  componentDidUpdate() {
    if (this.state.configurationLoaded && !this.intervalRegistered) {
      this.refreshOrderbook();
      setInterval(this.refreshOrderbook, this.state.configuration.refreshInterval);
      this.intervalRegistered = true;
    }
  }

  showSignIn() {
    this.setState({ displaySigninModal: true, signInFailure: false, });
  }

  passphraseSubmit(payload) {
    const keys = {};
    let atLeastOneKey = false;
    for (const asset in payload) {
      console.log(payload);
      if (payload[asset] !== undefined) {
        atLeastOneKey = true;
        const passphrase = payload[asset].trim();
        if (!Mnemonic.validateMnemonic(passphrase, Mnemonic.wordlists.english)) {
          this.setState({ signInFailure: true });
          return;
        } else {
          const address = (cryptography.getAddressAndPublicKeyFromPassphrase(passphrase)).address;
          keys[asset] = { address, passphrase };
        }
      }
    }
    if (atLeastOneKey) {
      this.setState({ keys, signedIn: true, displaySigninModal: false });
      this.refreshOrderbook();
    }
  }

  closeSignInModal = () => {
    this.setState({ displaySigninModal: false });
  }

  signOut = () => {
    this.setState({ signedIn: false, keys: {} });
  }

  setDisplayLeaveWarning = (val) => {
    this.setState({ displayLeaveWarning: val });
  }

  render() {
    if (!this.state.configurationLoaded) {
      return <div style={{ margin: '10px' }}>Loading...</div>
    }
    return <>
      <userContext.Provider value={{ ...this.state }}>
        {this.state.displaySigninModal && <SignInModal failure={this.state.signInFailure} passphraseSubmit={this.passphraseSubmit} enabledAssets={this.state.enabledAssets} close={this.closeSignInModal}></SignInModal>}
        {this.state.displayLeaveWarning && <LeaveWarning setDisplayLeaveWarning={this.setDisplayLeaveWarning}></LeaveWarning>}
        <div className="top-bar">
          <div>
            <b style={{ fontSize: '21px' }}>{this.state.configuration.appTitle}</b> &nbsp;
            <a style={{ color: '#34cfeb', fontSize: '14px' }} href={this.state.configuration.feedbackLink.url} rel="noopener noreferrer" target="_blank">{this.state.configuration.feedbackLink.text}</a>
          </div>
          <div>
            <SignInState showSignIn={this.showSignIn} keys={this.state.keys} signedIn={this.state.signedIn} signOut={this.signOut}></SignInState>
          </div>
        </div>
        <div className="container">
          <div className="sell-panel">
            <PlaceOrder side="sell"></PlaceOrder>
          </div>
          <div className="buy-panel">
            <PlaceOrder side="buy"></PlaceOrder>
          </div>
          <div className="orderbook-container">
            <div className="sell-orders">
              <Orderbook orderBookData={this.state.orderBookData} side="asks"></Orderbook>
            </div>
            <div className="price-display">
              Price: {this.state.maxBid} {this.state.activeAssets[1].toUpperCase()}
            </div>
            <div className="buy-orders">
              <Orderbook orderBookData={this.state.orderBookData} side="bids"></Orderbook>
            </div>
          </div>
          <div className="depth-chart">
            <Chart whole={Math.pow(10, 8)} activeAssets={this.state.activeAssets}></Chart>
          </div>
          <div className="your-orders">
            <YourOrders orders={this.state.myOrders}></YourOrders>
          </div>
          <div className="market-name-and-stats">
            <MarketList markets={this.state.configuration.markets} refreshInterval={this.state.configuration.refreshInterval}></MarketList>
          </div>
        </div>
      </userContext.Provider>
    </>;
  }
}

export default App;
