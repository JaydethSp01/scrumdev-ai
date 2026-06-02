import React, { useEffect, useState } from 'react';
import axios from 'axios';

const FacturaPage = () => {
  const [facturas, setFacturas] = useState([]);

  useEffect(() => {
    const fetchFacturas = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/factura`);
        setFacturas(response.data);
      } catch (error) {
        console.error('Error fetching facturas:', error);
      }
    };

    fetchFacturas();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Facturas</h1>
      <table className="table-auto w-full">
        <thead>
          <tr>
            <th className="px-4 py-2">ID</th>
            <th className="px-4 py-2">Cliente</th>
            <th className="px-4 py-2">Monto</th>
            <th className="px-4 py-2">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((factura) => (
            <tr key={factura.id}>
              <td className="border px-4 py-2">{factura.id}</td>
              <td className="border px-4 py-2">{factura.cliente}</td>
              <td className="border px-4 py-2">{factura.monto}</td>
              <td className="border px-4 py-2">{factura.fecha}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FacturaPage;
