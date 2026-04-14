import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { getStatusLabel } from '../utils/statusUtils'

const COLORS = ['var(--primary)', 'var(--warning)', 'var(--success)', 'var(--info)', 'var(--secondary)', 'var(--text-muted)', 'var(--danger)', 'var(--danger)', 'var(--success)', 'var(--success)']

export function StatusBarChart({ data }) {
  const chartData = Object.entries(data).map(([status, count]) => ({
    name: getStatusLabel(status),
    value: count
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
        <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)' }} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
        />
        <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function StatusPieChart({ data }) {
  const chartData = Object.entries(data)
    .filter(([_, count]) => count > 0)
    .map(([status, count]) => ({
      name: getStatusLabel(status),
      value: count
    }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function UserBarChart({ data }) {
  const chartData = Object.entries(data).map(([userId, count]) => ({
    name: userId,
    value: count
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
        <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)' }} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
        />
        <Bar dataKey="value" fill="var(--secondary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}