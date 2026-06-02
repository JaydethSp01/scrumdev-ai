import React, { useEffect, useState } from 'react';
import axios from 'axios';

const PropiedadesPage = () => {
  const [propiedades, setPropiedades] = useState([]);

  useEffect(() => {
    const fetchPropiedades = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/propiedades`);
        setPropiedades(response.data);
      } catch (error) {
        console.error('Error fetching propiedades:', error);
      }
    };
    fetchPropiedades();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Lista de Propiedades</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {propiedades.map((propiedad) => (
          <div key={propiedad.id} className="border rounded-lg p-4 shadow">
            <h2 className="text-xl font-semibold">{propiedad.nombre}</h2>
            <p className="text-gray-700">{propiedad.descripcion}</p>
            <p className="text-gray-500">Precio: {propiedad.precio}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PropiedadesPage;
