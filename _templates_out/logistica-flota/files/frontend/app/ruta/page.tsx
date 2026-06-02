import { useState, useEffect } from 'react';
import axios from 'axios';

const RutaPage = () => {
  const [rutas, setRutas] = useState([]);
  const [form, setForm] = useState({
    nombre: '',
    origen: '',
    destino: ''
  });

  useEffect(() => {
    fetchRutas();
  }, []);

  const fetchRutas = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/ruta`);
      setRutas(response.data);
    } catch (error) {
      console.error('Error fetching rutas:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/ruta`, form);
      fetchRutas();
    } catch (error) {
      console.error('Error creating ruta:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gestión de Rutas</h1>
      <form onSubmit={handleSubmit} className="mb-4">
        <input type="text" name="nombre" placeholder="Nombre" value={form.nombre} onChange={handleInputChange} className="border p-2 mr-2" />
        <input type="text" name="origen" placeholder="Origen" value={form.origen} onChange={handleInputChange} className="border p-2 mr-2" />
        <input type="text" name="destino" placeholder="Destino" value={form.destino} onChange={handleInputChange} className="border p-2" />
        <button type="submit" className="bg-blue-500 text-white p-2">Crear</button>
      </form>
      <ul>
        {rutas.map((ruta) => (
          <li key={ruta.id} className="p-2 border-b">
            {ruta.nombre} - {ruta.origen} a {ruta.destino}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RutaPage;
