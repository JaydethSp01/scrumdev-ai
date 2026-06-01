import React, { useEffect, useState } from 'react';
import axios from 'axios';

const DashboardPage = () => {
  const [metrics, setMetrics] = useState({});
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/mock/dashboard';

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await axios.get(`${apiUrl}/dashboard`);
        setMetrics(response.data);
      } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
      }
    };
    fetchMetrics();
  }, [apiUrl]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 shadow rounded">
          <h2 className="text-xl font-semibold">Leads Totales</h2>
          <p className="text-2xl">{metrics.totalLeads || 0}</p>
        </div>
        <div className="bg-white p-4 shadow rounded">
          <h2 className="text-xl font-semibold">Oportunidades Totales</h2>
          <p className="text-2xl">{metrics.totalOportunidades || 0}</p>
        </div>
        <div className="bg-white p-4 shadow rounded">
          <h2 className="text-xl font-semibold">Tasa de Conversión</h2>
          <p className="text-2xl">{metrics.conversionRate || 0}%</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
