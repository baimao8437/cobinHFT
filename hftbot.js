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

function setBid(bid){
  const {price, sizeDiff} = bid
  // console.log(price.toString(), sizeDiff.toString())
  if(price.gt(highestBid.price) && sizeDiff.isPos()){
    highestBid = {price, size: sizeDiff}
    console.log(`HIGHEST BID: ${highestBid.price.toString()} ${highestBid.size.toString()}`)
  }
  else if(price.eq(highestBid.price)){
    if(sizeDiff.isPos())
      highestBid = {price, size: highestBid.size.add(sizeDiff)}
    else
      highestBid = {price, size: highestBid.size.add(sizeDiff)}
    if(!highestBid.size.gt(0))
      highestBid = {price: new Decimal(0), size: new Decimal(0)}
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
    console.log(`LOWEST ASK: ${lowestAsk.price.toString()} ${lowestAsk.size.toString()}`)
  }
  else if(price.eq(lowestAsk.price)){
    if(sizeDiff.isPos())
      lowestAsk = {price, size: lowestAsk.size.add(sizeDiff)}
    else
      lowestAsk = {price, size: lowestAsk.size.add(sizeDiff)}
    if(!lowestAsk.size.gt(0))
      lowestAsk = {price: new Decimal(100000), size: new Decimal(0)}
    console.log(`LOWEST ASK: ${lowestAsk.price.toString()} ${lowestAsk.size.toString()}`)
  }

  if(myOrderPair.bid.price && sizeDiff.isPos() && price.lte(myOrderPair.bid.price) && myOrderPair.bid.state == 'open')
    mockCompleteOrder({bid: ask})
}

function getOrderbookWS() {
  client.subscribeOrderbook(PAIR, '1E-2', (msg) => {
    if(msg.update){
      const { bids, asks } = msg.update
      if(!!bids[0]) setBid(bids[0]);
      if(!!asks[0]) setAsk(asks[0]);

      if(myOrderPair.bid.state=='filled' && myOrderPair.ask.state=='filled' &&
        !highestBid.price.eq(0) && !lowestAsk.price.eq(100000) && lastTrade.price)
        createOrder()
    }
  })
  .then(() => {
    console.error('subscribe orderbook')
  })
  .catch((err) => {
    console.error(err)
    client.close()
  })
}

function getTradeWS() {
  client.subscribePublicTrade(PAIR, (msg) => {
    if(msg.update){
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
  })
}


function getOrderWS() {
  client.subscribeOrder((order) => {
    console.log(order);
    if(order.update){
      const {price, size, state, side} = order.update
      myOrderPair[side]={price: price, size, state}
      console.log('update myOrderPair', myOrderPair)
    }
  })
  .then(()=>{
    console.log('subscribe order')
  })
  .catch(()=>{
    client.close();
  })
}

async function createOrder() {
  // let dBid = lastTrade.price.sub(highestBid.price)
  // let dAsk = lowestAsk.price.sub(lastTrade.price)
  // let nearPrice = dBid.lt(dAsk) ? highestBid.price : lowestAsk.price
  // let [higherPrice, lowerPrice] = lastTrade.price.gt(nearPrice) ? [lastTrade.price, nearPrice] : [nearPrice, lastTrade.price]
  // let bidOrder = {side: 'bid', price: lowerPrice.add(0.01), size: ORDER_SIZE }
  // let askOrder = {side: 'ask', price: higherPrice.sub(0.01), size: ORDER_SIZE }

  let askOrder = {side: 'ask', price: lastTrade.price.add(0.01), size: ORDER_SIZE }
  let bidOrder = {side: 'bid', price: lastTrade.price.sub(0.01), size: ORDER_SIZE }

  let realAsk = await placeOrder(askOrder.side, askOrder.price, askOrder.size)
  let realBid = await placeOrder(bidOrder.side, bidOrder.price, bidOrder.size)
  console.log('\nPLACE ORDER')
  console.log(`ask: ${realAsk.price.toString()} ${realAsk.size.toString()} ${realAsk.state}`)
  console.log(`bid: ${realBid.price.toString()} ${realBid.size.toString()} ${realBid.state}`)
  // console.log('bid', bidOrder.price.toString(), bidOrder.size)
  // myOrderPair[realBid.side]={price: realBid.price, size: realBid.size, state: realBid.state}
  // console.log('ask', askOrder.price.toString(), askOrder.size)
  // myOrderPair[realAsk.side]={price: realAsk.price, size: realAsk.size, state: realAsk.state}
  console.log('\n')
  process.exit(0)
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

/*
就是我刚开始编写机器人的源代码，几乎没有改动，参数也是原来的参数。这个版本的程序有许多
需要改进的地方，但即使如此，它也当时表现除了惊人的盈利能力，在我本金不多时，不加杠杆平
均每天盈利在5%左右。当然无论从哪一方面，它都不适应今天的市场。
我同时也发了一篇文章在社区，大家可以看看。
by 小草
*/

//稍微改了一下，用了平台的容错函数_C(),和精度函数_N().
//取消全部订单
/*
//计算将要下单的价格
function GetPrice(Type,depth) {
  var amountBids=0;
  var amountAsks=0;
  //计算买价，获取累计深度达到预设的价格
  if(Type=="Buy"){
     for(var i=0;i<20;i++){
         amountBids+=depth.Bids[i].Amount;
         //floatamountbuy就是预设的累计买单深度
         if (amountBids>floatamountbuy){
             //稍微加0.01，使得订单排在前面
            return depth.Bids[i].Price+0.01;}
      }
  }
  //同理计算卖价
  if(Type=="Sell"){
     for(var j=0; j<20; j++){
       amountAsks+=depth.Asks[j].Amount;
          if (amountAsks>floatamountsell){
          return depth.Asks[j].Price-0.01;}
      }
  }
  //遍历了全部深度仍未满足需求，就返回一个价格，以免出现bug
  return depth.Asks[0].Price
}

function onTick() {
  var depth=_C(exchange.GetDepth);
  var buyPrice = GetPrice("Buy",depth);
  var sellPrice= GetPrice("Sell",depth);
  //买卖价差如果小于预设值diffprice，就会挂一个相对更深的价格
  if ((sellPrice - buyPrice) <= diffprice){
          buyPrice-=10;
          sellPrice+=10;}
  //把原有的单子全部撤销，实际上经常出现新的价格和已挂单价格相同的情况，此时不需要撤销
  CancelPendingOrders()
  //获取账户信息，确定目前账户存在多少钱和多少币
  var account=_C(exchange.GetAccount);
  //可买的比特币量
  var amountBuy = _N((account.Balance / buyPrice-0.1),2);
  //可卖的比特币量，注意到没有仓位的限制，有多少就买卖多少，因为我当时的钱很少
  var amountSell = _N((account.Stocks),2);
  if (amountSell > 0.02) {
      exchange.Sell(sellPrice,amountSell);}
  if (amountBuy > 0.02) {
      exchange.Buy(buyPrice, amountBuy);}
  //休眠，进入下一轮循环
  Sleep(sleeptime);
}

function main() {
  while (true) {
      onTick();
  }
}
*/
