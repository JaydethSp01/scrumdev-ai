import React, { useEffect, useState } from 'react';
import axios from 'axios';

const ContactosPage = () => {
  const [contactos, setContactos] = useState([]);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/mock/contactos';

  useEffect(() => {
    const fetchContactos = async () => {
      try {
        const response = await axios.get(`${apiUrl}/contactos`);
        setContactos(response.data);
      } catch (error) {
        console.error('Error fetching contactos:', error);
      }
    };
    fetchContactos();
  }, [apiUrl]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Contactos</h1>
      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="py-2">ID</th>
            <th className="py-2">Nombre</th>
            <th className="py-2">Teléfono</th>
            <th className="py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {contactos.map((contacto) => (
            <tr key={contacto.id} className="border-t">
              <td className="py-2">{contacto.id}</td>
              <td className="py-2">{contacto.name}</td>
              <td className="py-2">{contacto.phone}</td>
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

export default ContactosPage;
