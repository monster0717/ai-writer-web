import React from 'react';
import { PenTool, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    if (username.trim()) {
      localStorage.setItem('lujun_user', username);
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center font-sans text-[#E5E5E5] p-4">
      <div className="bg-[#1A1A1A] p-6 md:p-8 rounded border border-[#2A2A2A] w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-center w-16 h-16 bg-[#222] border border-[#333] rounded mx-auto mb-6">
          <PenTool className="w-8 h-8 text-[#FF5C00]" />
        </div>
        <h1 className="text-2xl font-bold text-center text-white mb-2 italic">爆款写作智能体 <span className="text-[#666] text-sm not-italic font-normal">v2.4 Pro</span></h1>
        <p className="text-[#888] text-center mb-8 text-[10px] uppercase tracking-widest font-bold">System Authentication</p>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#888] font-bold mb-2 block">创作者称呼 / USERNAME</label>
            <input
              name="username"
              type="text"
              required
              placeholder="例如：主理人"
              className="w-full bg-[#222] border border-[#333] text-white px-4 py-3 rounded focus:outline-none focus:border-[#FF5C00] transition-colors placeholder:text-[#444]"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[#FF5C00] hover:bg-[#FF7A30] text-black font-black uppercase tracking-widest text-xs py-4 px-4 rounded transition-colors flex items-center justify-center gap-2"
          >
            进入控制台 <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
