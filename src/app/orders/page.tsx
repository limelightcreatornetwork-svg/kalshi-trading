'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Order types matching the OMS
interface Order {
  id: string;
  clientOrderId: string;
  kalshiOrderId?: string | null;
  marketId: string;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  type: 'market' | 'limit';
  contracts: number;
  limitPrice?: number | null;
  filledContracts: number;
  avgFillPrice?: number | null;
  state: string;
  rejectReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

// State colors
const stateColors: Record<string, string> = {
  DRAFT: 'bg-gray-500',
  PENDING: 'bg-yellow-500',
  SUBMITTED: 'bg-blue-500',
  ACCEPTED: 'bg-emerald-500',
  PARTIAL_FILL: 'bg-purple-500',
  FILLED: 'bg-green-500',
  CANCELED: 'bg-orange-500',
  REJECTED: 'bg-red-500',
  EXPIRED: 'bg-gray-600',
};

// Active states that can be refreshed
const activeStates = ['DRAFT', 'PENDING', 'SUBMITTED', 'ACCEPTED', 'PARTIAL_FILL'];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const stateParam = filter === 'all' ? '' : `?state=${filter}`;
      const res = await fetch(`/api/oms/orders${stateParam}`);
      const data = await res.json();
      if (data.ok) {
        setOrders(data.orders);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Auto-refresh active orders every 5 seconds
  useEffect(() => {
    const hasActiveOrders = orders.some((o) => activeStates.includes(o.state));
    if (!hasActiveOrders) return;

    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [orders, fetchOrders]);

  const handleCancel = async (orderId: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;

    try {
      const res = await fetch(`/api/oms/orders/${orderId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        fetchOrders();
      } else {
        alert(data.error || 'Failed to cancel order');
      }
    } catch (error) {
      console.error('Failed to cancel order:', error);
      alert('Failed to cancel order');
    }
  };

  const handleReconcile = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/oms/reconcile', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        alert(
          `Reconciliation complete:\n` +
          `Orders checked: ${data.result.ordersChecked}\n` +
          `Drifts detected: ${data.result.driftsDetected}\n` +
          `Corrected: ${data.result.corrected}`
        );
        fetchOrders();
      }
    } catch (error) {
      console.error('Reconciliation failed:', error);
      alert('Reconciliation failed');
    } finally {
      setRefreshing(false);
    }
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return '-';
    return `$${(price / 100).toFixed(2)}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const canCancel = (state: string) => {
    return ['DRAFT', 'PENDING', 'SUBMITTED', 'ACCEPTED', 'PARTIAL_FILL'].includes(state);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">📋 Order Management</h1>
            <p className="text-gray-400 mt-1">
              Track and manage your trading orders
            </p>
          </div>
          <div className="flex gap-4">
            <Button
              onClick={handleReconcile}
              disabled={refreshing}
              variant="outline"
              className="border-gray-600"
            >
              {refreshing ? '🔄 Syncing...' : '🔄 Reconcile'}
            </Button>
            <Link href="/explorer">
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                + New Order
              </Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-gray-800 border-gray-700 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={filter === 'all' ? 'default' : 'outline'}
                onClick={() => setFilter('all')}
                className={filter === 'all' ? 'bg-emerald-600' : 'border-gray-600'}
              >
                All ({total})
              </Button>
              {['ACCEPTED', 'PARTIAL_FILL', 'FILLED', 'CANCELED', 'REJECTED'].map((state) => (
                <Button
                  key={state}
                  size="sm"
                  variant={filter === state ? 'default' : 'outline'}
                  onClick={() => setFilter(state)}
                  className={filter === state ? 'bg-emerald-600' : 'border-gray-600'}
                >
                  {state.replace('_', ' ')}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle>Orders</CardTitle>
            <CardDescription className="text-gray-400">
              {loading ? 'Loading...' : `${orders.length} orders`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-400">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No orders found.{' '}
                <Link href="/explorer" className="text-emerald-400 hover:underline">
                  Place your first order
                </Link>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-700">
                    <TableHead className="text-gray-400">Market</TableHead>
                    <TableHead className="text-gray-400">Side</TableHead>
                    <TableHead className="text-gray-400">Type</TableHead>
                    <TableHead className="text-gray-400 text-right">Qty</TableHead>
                    <TableHead className="text-gray-400 text-right">Filled</TableHead>
                    <TableHead className="text-gray-400 text-right">Price</TableHead>
                    <TableHead className="text-gray-400">State</TableHead>
                    <TableHead className="text-gray-400">Created</TableHead>
                    <TableHead className="text-gray-400"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id} className="border-gray-700">
                      <TableCell className="font-mono text-sm">
                        {order.marketId}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`font-semibold ${
                            order.action === 'buy' ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {order.action.toUpperCase()}
                        </span>{' '}
                        <span className="text-gray-400">{order.side}</span>
                      </TableCell>
                      <TableCell className="text-gray-300">{order.type}</TableCell>
                      <TableCell className="text-right">{order.contracts}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            order.filledContracts > 0 ? 'text-emerald-400' : 'text-gray-500'
                          }
                        >
                          {order.filledContracts}
                        </span>
                        {order.filledContracts > 0 && order.filledContracts < order.contracts && (
                          <span className="text-gray-500 text-xs ml-1">
                            ({Math.round((order.filledContracts / order.contracts) * 100)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {order.avgFillPrice
                          ? formatPrice(order.avgFillPrice)
                          : formatPrice(order.limitPrice)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${stateColors[order.state]} text-white`}>
                          {order.state.replace('_', ' ')}
                        </Badge>
                        {order.rejectReason && (
                          <span className="text-xs text-red-400 block mt-1">
                            {order.rejectReason}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell>
                        {canCancel(order.state) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                            onClick={() => handleCancel(order.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* State Legend */}
        <Card className="bg-gray-800 border-gray-700 mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Order State Lifecycle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Badge className={`${stateColors.DRAFT} text-white`}>DRAFT</Badge>
                <span className="text-gray-400">→ Created locally</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${stateColors.PENDING} text-white`}>PENDING</Badge>
                <span className="text-gray-400">→ Validating</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${stateColors.SUBMITTED} text-white`}>SUBMITTED</Badge>
                <span className="text-gray-400">→ Sent to Kalshi</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${stateColors.ACCEPTED} text-white`}>ACCEPTED</Badge>
                <span className="text-gray-400">→ In order book</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${stateColors.PARTIAL_FILL} text-white`}>PARTIAL</Badge>
                <span className="text-gray-400">→ Partially filled</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${stateColors.FILLED} text-white`}>FILLED</Badge>
                <span className="text-gray-400">→ Complete</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Back to Home */}
        <div className="mt-8 text-center">
          <Link href="/" className="text-gray-400 hover:text-white">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
