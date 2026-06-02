import React, { useEffect, useState } from 'react';
import axios from 'axios';

const VisitasPage = () => {
  const [visitas, setVisitas] = useState([]);

  useEffect(() => {
    const fetchVisitas = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/visitas`);
        setVisitas(response.data);
      } catch (error) {
        console.error('Error fetching visitas:', error);
      }
    };
    fetchVisitas();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Lista de Visitas</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visitas.map((visita) => (
          <div key={visita.id} className="border rounded-lg p-4 shadow">
            <h2 className="text-xl font-semibold">{visita.propiedad}</h2>
            <p className="text-gray-700">Cliente: {visita.cliente}</p>
            <p className="text-gray-500">Fecha: {new Date(visita.fecha).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VisitasPage;
