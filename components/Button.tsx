import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  active?: boolean;
  icon?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'secondary', 
  active = false, 
  icon,
  className = '',
  ...props 
}) => {
  const baseStyle = "flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm";
  
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20",
    secondary: "bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700",
    danger: "bg-red-900/50 hover:bg-red-800/50 text-red-200 border border-red-900",
    ghost: "bg-transparent hover:bg-gray-800 text-gray-400 hover:text-white"
  };

  const activeStyle = active ? "ring-2 ring-blue-500 bg-gray-700 text-white" : "";

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${activeStyle} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      {...props}
    >
      {icon && <span className="w-4 h-4">{icon}</span>}
      {children}
    </button>
  );
};

export default Button;
