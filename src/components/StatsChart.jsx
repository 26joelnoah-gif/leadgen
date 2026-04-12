import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, LineChart, Line, Legend, PieChart, Pie
} from 'recharts';

const COLORS = ['#0F4C36', '#D4AF37', '#166A4B', '#093322', '#E5C158', '#2E7D32', '#D32F2F', '#0288D1', '#F57C00', '#7B1FA2'];

export default function StatsChart({ type = 'bar', data = [], dataKey = 'value', nameKey = 'name', title }) {
  if (!data || data.length === 0) {
    return <div className="text-muted text-center p-8">Geen gegevens voor grafiek</div>;
  }

  const renderChart = () => {
    switch (type) {
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey={dataKey}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );
      case 'line':
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey={nameKey} axisLine={false} tickLine={false} fontSize={12} tick={{ fill: 'var(--text-muted)' }} />
            <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: 'var(--text-muted)' }} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-white)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
            />
            <Legend />
            <Line type="monotone" dataKey="calls" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary)', r: 4 }} activeDot={{ r: 6 }} name="Bellen" />
            <Line type="monotone" dataKey="afspraken" stroke="var(--secondary)" strokeWidth={3} dot={{ fill: 'var(--secondary)', r: 4 }} activeDot={{ r: 6 }} name="Afspraken" strokeDasharray="5 5" />
            <Line type="monotone" dataKey="deals" stroke="var(--success)" strokeWidth={3} dot={{ fill: 'var(--success)', r: 4 }} activeDot={{ r: 6 }} name="Deals" />
          </LineChart>
        );
      default:
        return (
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey={nameKey} axisLine={false} tickLine={false} fontSize={12} tick={{ fill: 'var(--text-muted)' }} />
            <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: 'var(--text-muted)' }} />
            <Tooltip
              cursor={{ fill: 'rgba(15, 76, 54, 0.05)' }}
              contentStyle={{ background: 'var(--bg-white)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
              formatter={(value, name) => [value, title.toLowerCase().includes('status') ? 'Afspraken' : 'Leads']}
            />
            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        );
    }
  };

  return (
    <div className="card h-full glow-hover" style={{ minHeight: '350px' }}>
      {title && <h3 className="card-title mb-3" style={{ fontSize: '1rem', opacity: 0.8 }}>{title}</h3>}
      <div style={{ width: '100%', height: '300px' }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
