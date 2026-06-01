import React, { useEffect, useState } from 'react';
import axios from 'axios';

const ActividadesPage = () => {
  const [actividades, setActividades] = useState([]);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/mock/actividades';

  useEffect(() => {
    const fetchActividades = async () => {
      try {
        const response = await axios.get(`${apiUrl}/actividades`);
        setActividades(response.data);
      } catch (error) {
        console.error('Error fetching actividades:', error);
      }
    };
    fetchActividades();
  }, [apiUrl]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Actividades</h1>
      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="py-2">ID</th>
            <th className="py-2">Descripción</th>
            <th className="py-2">Fecha</th>
            <th className="py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {actividades.map((actividad) => (
            <tr key={actividad.id} className="border-t">
              <td className="py-2">{actividad.id}</td>
              <td className="py-2">{actividad.description}</td>
              <td className="py-2">{actividad.date}</td>
              <td className="py-2">
                <button className="bg-blue-500 text-white px-2 py-1 rounded">Editar</button>
                <button className="bg-red-500 text-white px-2 py-1 rounded ml-2">Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ActividadesPage;
