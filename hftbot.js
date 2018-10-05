const key = require('./secret')
const Decimal = require('decimal.js')

const Client = require('./index')
let client = new Client({ key: key })
const PAIR = 'ETH-USDT'
const ORDER_SIZE = '0.1'

let highestBid = {price: new Decimal(0), size: new Decimal(0)}
let lowestAsk = {price: new Decimal(1000000), size: new Decimal(0)}
let lastTrade = {price: null, size: null}
let myOrderPair = {
  ask:{
    price: null,
    size: null,
    state: 'filled',
  }, bid:{
    price: null,
    size: null,
    state: 'filled',
  }
}
let tradeLocked = false
let bidOrAsk = [] // ask = 1 bid = 0

function setBid(bid){
  const {price, sizeDiff} = bid
  // console.log(price.toString(), sizeDiff.toString())
  if(price.gt(highestBid.price) && sizeDiff.isPos()){
    highestBid = {price, size: sizeDiff}
    bidOrAsk.unshift(0)
    if(bidOrAsk.length===50) bidOrAsk.pop()
    console.log(`HIGHEST BID: ${highestBid.price.toString()} ${highestBid.size.toString()}`)
  }
  else if(price.eq(highestBid.price)){
    highestBid = {price, size: highestBid.size.add(sizeDiff)}
    if(!highestBid.size.gt(0)){
      highestBid = {price: new Decimal(0), size: new Decimal(0)}
    } else {
      bidOrAsk.unshift(0)
      if(bidOrAsk.length===50) bidOrAsk.pop()
    }
    console.log(`HIGHEST BID: ${highestBid.price.toString()} ${highestBid.size.toString()}`)
  }

  if(myOrderPair.ask.price && sizeDiff.isPos() && price.gte(myOrderPair.ask.price) && myOrderPair.ask.state == 'open')
    mockCompleteOrder({ask: bid})
}

function setAsk(ask){
  const {price, sizeDiff} = ask
  // console.log(price.toString(), sizeDiff.toString(), sizeDiff.isPos())
  if(price.lt(lowestAsk.price) && sizeDiff.isPos()){
    lowestAsk = {price, size: sizeDiff}
    bidOrAsk.unshift(1)
    if(bidOrAsk.length===50) bidOrAsk.pop()
    console.log(`LOWEST ASK: ${lowestAsk.price.toString()} ${lowestAsk.size.toString()}`)
  }
  else if(price.eq(lowestAsk.price)){
    lowestAsk = {price, size: lowestAsk.size.add(sizeDiff)}
    if(!lowestAsk.size.gt(0)){
      lowestAsk = {price: new Decimal(100000), size: new Decimal(0)}
    } else {
      bidOrAsk.unshift(1)
      if(bidOrAsk.length===50) bidOrAsk.pop()
    }
    console.log(`LOWEST ASK: ${lowestAsk.price.toString()} ${lowestAsk.size.toString()}`)
  }

  if(myOrderPair.bid.price && sizeDiff.isPos() && price.lte(myOrderPair.bid.price) && myOrderPair.bid.state == 'open')
    mockCompleteOrder({bid: ask})
}

function getOrderbookWS() {
  client.subscribeOrderbook(PAIR, '1E-2', (msg) => {
    if(msg.update && ! tradeLocked){
      const { bids, asks } = msg.update
      if(!!bids[0]) setBid(bids[0]);
      if(!!asks[0]) setAsk(asks[0]);

      if(myOrderPair.bid.state=='filled' && myOrderPair.ask.state=='filled' &&
        !highestBid.price.eq(0) && !lowestAsk.price.eq(100000) && lastTrade.price && !tradeLocked){
          tradeLocked = true
          createOrder()
        }
    }
  })
  .then(() => {
    console.error('subscribe orderbook')
  })
  .catch((err) => {
    console.error(err)
    client.close()
    process.exit();
  })
}

function getTradeWS() {
  client.subscribePublicTrade(PAIR, (msg) => {
    if(msg.update && !tradeLocked){
      const{ price, size } = msg.update[0]
      lastTrade = {price, size}
      console.log(`\nTRADE OCCER at ${price.toString()} for ${size.toString()}\nbid: ${highestBid.price.toString()}, ask: ${lowestAsk.price.toString()}\n`);
    }
  })
  .then(() => {
    console.log('subscribe trade')
  })
  .catch((err) => {
    console.log(err)
    client.close()
    process.exit();
  })
}


function getOrderWS() {
  client.subscribeOrder((order) => {
    if(order.update){
      const {price, size, state, side} = order.update
      myOrderPair[side]={price: price, size, state}
      console.log('update myOrderPair:', side, myOrderPair[side].price.toString(), myOrderPair[side].state);
      if(myOrderPair.bid.state == 'filled' && myOrderPair.ask.state == 'filled'){
        tradeLocked = false;
      }
    }
  })
  .then(()=>{
    console.log('subscribe order')
  })
  .catch(()=>{
    console.log(err)
    client.close();
    process.exit();
  })
}

async function createOrder() {
  let momentent = bidOrAsk.reduce((a, b)=> a + b) > 25 ? 'ask' : 'bid'
  console.log('bid or ask: ', momentent)
  let higherPrice = momentent == 'ask' ?  lastTrade.price.sub(0.01) : (lastTrade.price.add(lowestAsk.price)).div(2)
  let lowerPrice = momentent == 'ask' ? (lastTrade.price.add(highestBid.price)).div(2) : lastTrade.price.add(0.01)
  let askOrder = {side: 'ask', price: higherPrice, size: ORDER_SIZE}
  let bidOrder = {side: 'bid', price: lowerPrice, size: ORDER_SIZE}
  lastTrade = {price: null, size: null}

  // let dBid = lastTrade.price.sub(highestBid.price)
  // let dAsk = lowestAsk.price.sub(lastTrade.price)
  // let nearPrice = dBid.lt(dAsk) ? highestBid.price : lowestAsk.price
  // let [higherPrice, lowerPrice] = lastTrade.price.gt(nearPrice) ? [lastTrade.price, (nearPrice.add(lastTrade.price)).div(2)] : [(nearPrice.add(lastTrade.price)).div(2), lastTrade.price]
  // let bidOrder = {side: 'bid', price: higherPrice.toFixed(2) === lowerPrice.toFixed(2) ? lowerPrice.sub(0.02) : lowerPrice.add(0.01), size: ORDER_SIZE }
  // let askOrder = {side: 'ask', price: higherPrice.toFixed(2) === lowerPrice.toFixed(2) ? higherPrice.sub(0.01) : higherPrice.sub(0.01), size: ORDER_SIZE }

  // let askOrder = {side: 'ask', price: lastTrade.price.add(0.01), size: ORDER_SIZE }
  // let bidOrder = {side: 'bid', price: lastTrade.price.sub(0.01), size: ORDER_SIZE }

  let realAsk = await placeOrder(askOrder.side, askOrder.price, askOrder.size)
  let realBid = await placeOrder(bidOrder.side, bidOrder.price, bidOrder.size)
  console.log('\nPLACE ORDER')
  console.log(`ask: ${realAsk.price.toString()} ${realAsk.size.toString()} ${realAsk.state}`)
  console.log(`bid: ${realBid.price.toString()} ${realBid.size.toString()} ${realBid.state}`)
  // console.log('ask', askOrder.price.toString(), askOrder.size)
  // myOrderPair[realAsk.side]={price: realAsk.price, size: realAsk.size, state: realAsk.state}
  // console.log('bid', bidOrder.price.toString(), bidOrder.size)
  // myOrderPair[realBid.side]={price: realBid.price, size: realBid.size, state: realBid.state}
  console.log('\n')
}

function placeOrder(side, price, size){
  return client.placeLimitOrder(PAIR, side, price, size, 'exchange')
}

function mockCompleteOrder({bid, ask}) {
  if(bid){
    myOrderPair.bid.state='filled'
    console.log(`BOUGHT at ${myOrderPair.bid.price}`)
  }
  if(ask){
    myOrderPair.ask.state='filled'
    console.log(`SELL at ${myOrderPair.ask.price}`)
  }
  if(myOrderPair.bid.state == myOrderPair.ask.state){
    console.log(`\nEARN: ${myOrderPair.ask.price.sub(myOrderPair.bid.price).mul(ORDER_SIZE).toString()}`)
  }
}


client.on('open', ()=>{
  console.error('open')
  getOrderWS()
  getOrderbookWS()
  getTradeWS()
})
