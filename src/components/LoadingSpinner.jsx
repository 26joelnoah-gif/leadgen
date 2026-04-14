export default function LoadingSpinner({ size = 'medium', color = 'var(--primary)' }) {
  const sizeMap = {
    small: '20px',
    medium: '40px',
    large: '60px'
  };

  const actualSize = sizeMap[size] || size;

  return (
    <div className="flex items-center justify-center p-8">
      <div 
        className="loading-spinner"
        style={{
          width: actualSize,
          height: actualSize,
          border: `3px solid var(--bg-elevated)`,
          borderTop: `3px solid ${color}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}
      ></div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}