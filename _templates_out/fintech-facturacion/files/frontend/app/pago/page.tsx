import React, { useEffect, useState } from 'react';
import axios from 'axios';

const PagoPage = () => {
  const [pagos, setPagos] = useState([]);

  useEffect(() => {
    const fetchPagos = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/pago`);
        setPagos(response.data);
      } catch (error) {
        console.error('Error fetching pagos:', error);
      }
    };

    fetchPagos();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Pagos</h1>
      <table className="table-auto w-full">
        <thead>
          <tr>
            <th className="px-4 py-2">ID</th>
            <th className="px-4 py-2">Factura</th>
            <th className="px-4 py-2">Monto</th>
            <th className="px-4 py-2">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {pagos.map((pago) => (
            <tr key={pago.id}>
              <td className="border px-4 py-2">{pago.id}</td>
              <td className="border px-4 py-2">{pago.factura}</td>
              <td className="border px-4 py-2">{pago.monto}</td>
              <td className="border px-4 py-2">{pago.fecha}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PagoPage;
