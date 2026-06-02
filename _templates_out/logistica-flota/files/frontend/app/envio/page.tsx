import { useState, useEffect } from 'react';
import axios from 'axios';

const EnvioPage = () => {
  const [envios, setEnvios] = useState([]);
  const [form, setForm] = useState({
    descripcion: '',
    destino: '',
    conductorId: '',
    vehiculoId: ''
  });

  useEffect(() => {
    fetchEnvios();
  }, []);

  const fetchEnvios = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/envio`);
      setEnvios(response.data);
    } catch (error) {
      console.error('Error fetching envios:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/envio`, form);
      fetchEnvios();
    } catch (error) {
      console.error('Error creating envio:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gestión de Envíos</h1>
      <form onSubmit={handleSubmit} className="mb-4">
        <input type="text" name="descripcion" placeholder="Descripción" value={form.descripcion} onChange={handleInputChange} className="border p-2 mr-2" />
        <input type="text" name="destino" placeholder="Destino" value={form.destino} onChange={handleInputChange} className="border p-2 mr-2" />
        <input type="text" name="conductorId" placeholder="ID Conductor" value={form.conductorId} onChange={handleInputChange} className="border p-2 mr-2" />
        <input type="text" name="vehiculoId" placeholder="ID Vehículo" value={form.vehiculoId} onChange={handleInputChange} className="border p-2" />
        <button type="submit" className="bg-blue-500 text-white p-2">Crear</button>
      </form>
      <ul>
        {envios.map((envio) => (
          <li key={envio.id} className="p-2 border-b">
            {envio.descripcion} - Destino: {envio.destino}, Conductor ID: {envio.conductorId}, Vehículo ID: {envio.vehiculoId}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default EnvioPage;
