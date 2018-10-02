const key = require('./secret')

const Client = require('./index')
let client = new Client({ key: key })
const PAIR = 'ETH-USDT'
const ORDER_SIZE = '0.1'

let highestBid = {price: 0, size: 0}
let lowestAsk = {price: 1000000, size: 0}
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
  let [price, type, size] = bid
  price = parseFloat(price).toFixed(2)
  type = type == 1 ? 'add' : 'remove'
  // console.log('bid', price, type, size)
  if(parseFloat(price) > parseFloat(highestBid.price) && type == 'add'){
    highestBid = {price, size}
    console.log('HIGHTEST BID', highestBid)
  }
  if(type == 'remove' && price == highestBid.price){
    highestBid = {price: 0, size: 0}
  }

  if(type=='add' && parseFloat(price) >= parseFloat(myOrderPair.ask.price) && myOrderPair.ask.state == 'open')
    mockCompleteOrder({ask: bid})
}

function setAsk(ask){
  let [price, type, size] = ask
  price = parseFloat(price).toFixed(2)
  type = type == 1 ? 'add' : 'remove'
  // console.log('ask', price, parseFloat(price) , parseFloat(lowestAsk.price))
  if(parseFloat(price) < parseFloat(lowestAsk.price) && type == 'add'){
    lowestAsk = {price, size}
    console.log('LOWEST ASK', lowestAsk)
  }
  if(type == 'remove' && price == lowestAsk.price){
    lowestAsk = {price: 100000, size: 0}
  }

  if(type=='add' && parseFloat(price) <= parseFloat(myOrderPair.bid.price) && myOrderPair.bid.state == 'open')
    mockCompleteOrder({bid: ask})
}

function getOrderbookWS() {
  client.subscribeOrderbook(PAIR, '1E-2', (msg) => {
    const { bids, asks } = msg.data
    if(!!bids[0]) setBid(bids[0]);
    if(!!asks[0]) setAsk(asks[0]);

    if(myOrderPair.bid.state=='filled' && myOrderPair.ask.state=='filled' &&
      highestBid.size && lowestAsk.size)
      createOrder()
  })
  .then(() => {
    console.error('subscribe orderbook')
  })
  .catch((err) => {
    console.error(err)
    client.close()
  })
}


function getOrderWS() {
  client.subscribeOrder((order) => {
    const {price, size, state, side} = order.update
    myOrderPair[side]={price: price.toFixed(2), size: size.toString(), state}
    console.log('update myOrderPair', myOrderPair)
  })
  .then(()=>{
    console.log('subscribe order')
  })
  .catch(()=>{
    client.close();
  })
}

client.on('open', ()=>{
  console.error('open')
  getOrderWS()
  getOrderbookWS()
})



function cancelAllOrder() {
  for(order of allOrders){
    client.cancelOrder(order.id)
  }
}

function createOrder() {
  let bidOrder = {side: 'bid', price: (parseFloat(highestBid.price) + 0.01).toFixed(2), size: ORDER_SIZE }
  let askOrder = {side: 'ask', price: (parseFloat(lowestAsk.price) - 0.01).toFixed(2), size: ORDER_SIZE }

  // client.placeLimitOrder(PAIR, 'bid', bidOrder.price, bidOrder.size, 'exchange')
  // client.placeLimitOrder(PAIR, 'ask', askOrder.price, askOrder.size, 'exchange')
  console.log('\n')
  console.log(PAIR, 'bid', bidOrder.price, bidOrder.size, 'exchange')
  myOrderPair[bidOrder.side]={price: bidOrder.price, size: bidOrder.size, state: 'open'}
  console.log(PAIR, 'ask', askOrder.price, askOrder.size, 'exchange')
  myOrderPair[askOrder.side]={price: askOrder.price, size: askOrder.size, state: 'open'}
  console.log('\n')

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
    console.log(`\nEARN: ${parseFloat(myOrderPair.ask.price) - parseFloat(myOrderPair.bid.price) * ORDER_SIZE}`)
  }
}

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
