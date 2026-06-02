import React, { useEffect, useState } from 'react';
import axios from 'axios';

const ImpuestoPage = () => {
  const [impuestos, setImpuestos] = useState([]);

  useEffect(() => {
    const fetchImpuestos = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/impuesto`);
        setImpuestos(response.data);
      } catch (error) {
        console.error('Error fetching impuestos:', error);
      }
    };

    fetchImpuestos();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Impuestos</h1>
      <table className="table-auto w-full">
        <thead>
          <tr>
            <th className="px-4 py-2">ID</th>
            <th className="px-4 py-2">Descripción</th>
            <th className="px-4 py-2">Tasa</th>
          </tr>
        </thead>
        <tbody>
          {impuestos.map((impuesto) => (
            <tr key={impuesto.id}>
              <td className="border px-4 py-2">{impuesto.id}</td>
              <td className="border px-4 py-2">{impuesto.descripcion}</td>
              <td className="border px-4 py-2">{impuesto.tasa}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ImpuestoPage;
