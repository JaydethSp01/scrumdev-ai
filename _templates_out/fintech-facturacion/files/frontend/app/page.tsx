import { AppShell, PageHeader, MetricCard, DataTable, Card } from '@/components/ui';
import { useState, useEffect } from 'react';
import { fetchData } from '@/lib/api';

const MOCK_DATA = { facturas: 10, clientes: 5, pagos: 7, impuestos: 3 };

export default function Dashboard() {
  const [data, setData] = useState(MOCK_DATA);

  useEffect(() => {
    fetchData('/dashboard').then(d => d && setData(d));
  }, []);

  return (
    <AppShell
      items={[
        { href: '/', label: 'Inicio' },
        { href: '/factura', label: 'Facturas' },
        { href: '/cliente', label: 'Clientes' },
        { href: '/pago', label: 'Pagos' },
        { href: '/impuesto', label: 'Impuestos' }
      ]}
      title="Dashboard"
    >
      <PageHeader title="Dashboard" subtitle="Visión general" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard label="Facturas" value={data.facturas} className="rounded-xl shadow-md bg-white dark:bg-gray-800 p-4" />
        <MetricCard label="Clientes" value={data.clientes} className="rounded-xl shadow-md bg-white dark:bg-gray-800 p-4" />
        <MetricCard label="Pagos" value={data.pagos} className="rounded-xl shadow-md bg-white dark:bg-gray-800 p-4" />
        <MetricCard label="Impuestos" value={data.impuestos} className="rounded-xl shadow-md bg-white dark:bg-gray-800 p-4" />
      </div>
      <Card className="mt-8 p-6 rounded-2xl shadow-lg bg-white dark:bg-gray-800">
        <DataTable
          columns={[
            { key: 'id', header: 'ID' },
            { key: 'nombre', header: 'Nombre' },
            { key: 'estado', header: 'Estado', render: r => <Badge tone={r.estado === 'activo' ? 'success' : 'warning'}>{r.estado}</Badge> }
          ]}
          rows={[]}
          className="w-full"
        />
      </Card>
    </AppShell>
  );
}