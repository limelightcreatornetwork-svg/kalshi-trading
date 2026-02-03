import * as kalshi from '../src/lib/kalshi';

async function main() {
  console.log('=== CHECKING ACCOUNT STATUS ===\n');
  
  // Check balance
  const balance = await kalshi.getBalance();
  console.log('💰 Balance:');
  console.log('   Portfolio Value:', '$' + (balance.portfolio_value / 100).toFixed(2));
  console.log('   Balance:', '$' + (balance.balance / 100).toFixed(2));
  
  // Check open orders
  console.log('\n📋 Open Orders:');
  const orders = await kalshi.getOrders({ status: 'resting' });
  if (orders.orders && orders.orders.length > 0) {
    for (const order of orders.orders) {
      console.log('   Order ID:', order.order_id);
      console.log('   Ticker:', order.ticker);
      console.log('   Side:', order.side, '|', 'Action:', order.action);
      console.log('   Price:', order.yes_price + '¢');
      console.log('   Contracts:', order.remaining_count);
      console.log('   Cost if filled:', '$' + ((order.yes_price * order.remaining_count) / 100).toFixed(2));
      console.log('   Status:', order.status);
      console.log('   ---');
    }
  } else {
    console.log('   No open orders');
  }
  
  // Check filled orders
  console.log('\n✅ Recent Filled Orders:');
  const filledOrders = await kalshi.getOrders({ status: 'executed' });
  if (filledOrders.orders && filledOrders.orders.length > 0) {
    for (const order of filledOrders.orders.slice(0, 5)) {
      console.log('   Order ID:', order.order_id);
      console.log('   Ticker:', order.ticker);
      console.log('   Side:', order.side);
      console.log('   Fill Count:', order.fill_count);
      console.log('   ---');
    }
  } else {
    console.log('   No filled orders');
  }
  
  // Check positions
  console.log('\n📊 Current Positions:');
  const positions = await kalshi.getPositions();
  if (positions.market_positions && positions.market_positions.length > 0) {
    let hasPositions = false;
    for (const pos of positions.market_positions) {
      if (pos.position !== 0) {
        hasPositions = true;
        console.log('   Ticker:', pos.ticker);
        console.log('   Position:', pos.position, 'contracts');
        console.log('   ---');
      }
    }
    if (!hasPositions) {
      console.log('   No open positions');
    }
  } else {
    console.log('   No positions');
  }
}

main().catch(console.error);
