import React, { useEffect, useState } from 'react';
import axios from 'axios';

const OportunidadesPage = () => {
  const [oportunidades, setOportunidades] = useState([]);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/mock/oportunidades';

  useEffect(() => {
    const fetchOportunidades = async () => {
      try {
        const response = await axios.get(`${apiUrl}/oportunidades`);
        setOportunidades(response.data);
      } catch (error) {
        console.error('Error fetching oportunidades:', error);
      }
    };
    fetchOportunidades();
  }, [apiUrl]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Oportunidades</h1>
      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="py-2">ID</th>
            <th className="py-2">Descripción</th>
            <th className="py-2">Etapa</th>
            <th className="py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {oportunidades.map((oportunidad) => (
            <tr key={oportunidad.id} className="border-t">
              <td className="py-2">{oportunidad.id}</td>
              <td className="py-2">{oportunidad.description}</td>
              <td className="py-2">{oportunidad.stage}</td>
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

export default OportunidadesPage;
