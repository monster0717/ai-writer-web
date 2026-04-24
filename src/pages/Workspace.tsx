import { GoogleGenAI } from '@google/genai';
import {
  AlertCircle,
  Copy,
  FileText,
  History,
  Info,
  Loader2,
  LogOut,
  Menu,
  Paperclip,
  PenTool,
  Plus,
  Send,
  Settings,
  X
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import mammoth from 'mammoth/mammoth.browser.js';

interface HistoryItem {
  id: string;
  topic: string;
  materials: string;
  content: string;
  timestamp: number;
}

const SYSTEM_PROMPT = `# Role: 房地产新媒体爆款写作智能体

## Profile
- **身份**: 15年房地产行业经验的资深地产分析师、微信公众号爆款操盘手和数据极客。
- **风格原型**: 深度内化房产大V"真叫卢俊"的写作风格——大白话讲透硬核逻辑，烟火气包裹专业洞察，数据锚定观点。
- **语言风格**: 像见多识广的老朋友跟读者聊天，口语化、场景化、有温度、有锐度。

## Goals
1. 根据用户提供的一句话题（及补充资料），输出一篇不少于2000字的微信公众号深度长文。
2. 兼具"情绪共鸣力"和"数据说服力"。
3. 自然衔接商业植入建议。

## Constraints
1. **数据铁律**: 引用数据必须标注来源，严禁捏造。无数据时需模糊引用或提示。
2. **合规底线**: 无绝对性投资建议，不违反广告法，不散布恐慌。
3. **格式铁律**: 纯 Markdown 输出，"短句+高频换行+加粗高亮"排版。
4. **字数要求**: 正文不少于2000字。
5. **演绎边界**: 第一视角场景描写须基于合理推演。

## Output Format (严格按此结构输出)
### 一、备选标题（2-3个）
（包含认知颠覆型、概念降维型、焦虑与痛点型、第一视角型，口语化，零术语）
### 二、灵魂摘要
（四字/极短句箴言，作为文眼）
### 三、正文（不少于2000字）
- **开篇**: "老友记"式引入（前200字亮出矛盾/悬念，绝不写报告式开头）。
- **论证**: 见微知著 + 数据场景化（必须包含第一人称实地探访描写）。
- **金句**: 每800-1000字一句加粗金句（反差洞察/温情现实/趋势断言）。
- **情绪曲线**: 制造焦虑 -> 层层剥茧 -> 理性抚慰。
- **结尾**: 视角拉升，温情托底，互动留白。
- **排版**: 一句话一行，段落3-4行。自动插入配图建议（>[🖼️ 此处插入图片：...]）。
### 四、数据来源标注
（脚注形式列出）
### 五、智能商业植入建议
（核心痛点、目标受众画像、推荐植入方向、过渡话术参考）`;

export default function Workspace() {
  const navigate = useNavigate();
  const [user, setUser] = useState<string | null>(() => localStorage.getItem('lujun_user'));
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('lujun_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  
  const [histories, setHistories] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  
  const [topic, setTopic] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!apiKey && !process.env.GEMINI_API_KEY) {
      setShowSettings(true);
    }
  }, []);

  // Load history when user changes
  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`lujun_history_${user}`);
      if (saved) {
        try {
          setHistories(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse history");
        }
      } else {
        setHistories([]);
      }
    }
  }, [user]);

  // Save history
  useEffect(() => {
    if (user && histories.length > 0) {
      localStorage.setItem(`lujun_history_${user}`, JSON.stringify(histories));
    }
  }, [histories, user]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('lujun_user');
    navigate('/login');
  };

  const handleSaveSettings = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const key = formData.get('apiKey') as string;
    setApiKey(key);
    localStorage.setItem('lujun_api_key', key);
    setShowSettings(false);
    showToast('API Key 保存成功', 'success');
  };

  const generateContent = async () => {
    if (!topic.trim()) {
      showToast('写偏门也要有个准星，先输入个话题吧', 'error');
      return;
    }

    const currentApiKey = apiKey || process.env.GEMINI_API_KEY;
    
    if (!currentApiKey) {
      showToast('API Key 缺失，请先在右上角设置中配置', 'error');
      setShowSettings(true);
      return;
    }

    setIsGenerating(true);
    setDraftContent('');
    setActiveHistoryId(null); // Switch back to draft view if viewing history
    
    try {
      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      const fileParts = await Promise.all(files.map(async file => {
        if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          return `【文档参考：${file.name}】\n${result.value}`;
        }
        
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              inlineData: {
                data: (reader.result as string).split(',')[1],
                mimeType: file.type
              }
            });
          };
          reader.readAsDataURL(file);
        });
      }));

      const contents: any[] = [
        `话题：${topic}`
      ];
      contents.push(...fileParts as any[]);

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-pro-preview',
        contents: contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
        }
      });

      let fullText = '';
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullText += chunk.text;
          setDraftContent(fullText);
          
          // Auto scroll to bottom
          if (scrollRef.current) {
             scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }
      }

      // Save to history once complete
      const newHistory: HistoryItem = {
        id: Date.now().toString(),
        topic,
        materials: files.map(f => f.name).join(', '),
        content: fullText,
        timestamp: Date.now()
      };
      
      setHistories(prev => [newHistory, ...prev]);
      setActiveHistoryId(newHistory.id);
      showToast('爆款码字完成，快来看看', 'success');
      
    } catch (error) {
      console.error(error);
      showToast('生成出错，是不是网络卡了或者 Key 不对？', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    const textToCopy = getDisplayContent();
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      showToast('全文已复制到剪贴板', 'success');
    }
  };

  const activeHistory = histories.find(h => h.id === activeHistoryId);
  const getDisplayContent = () => {
    if (activeHistory) return activeHistory.content;
    return draftContent;
  };
  
  const displayContent = getDisplayContent();

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-[#E5E5E5] font-sans overflow-hidden">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl bg-[#222] border border-[#333] animate-in fade-in slide-in-from-top-4">
          {toast.type === 'success' && <div className="w-2 h-2 rounded-full bg-green-500" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
          <span className="text-sm font-medium text-white">{toast.message}</span>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center">
          <div className="bg-[#1A1A1A] p-6 rounded border border-[#2A2A2A] w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#FF5C00]" />
                API 配置
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-[#888] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#888] font-bold mb-2 block">Google Gemini API Key</label>
                <input
                  name="apiKey"
                  type="password"
                  defaultValue={apiKey}
                  placeholder="AI Studio 默认自动注入，可在此覆盖"
                  className="w-full bg-[#222] border border-[#333] text-white px-4 py-2 rounded focus:outline-none focus:border-[#FF5C00] transition-colors placeholder:text-[#666]"
                />
              </div>
              <p className="text-xs text-[#666] flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                <span>密钥存储在本地浏览器，不会上传至任何第三方服务器。如果不填，系统将尝试使用默认环境变量。</span>
              </p>
              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  className="bg-[#FF5C00] hover:bg-[#FF7A30] text-black font-black uppercase tracking-widest text-[10px] py-3 px-6 rounded transition-colors"
                >
                  保存设置
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 bg-[#141414] border-r border-[#2A2A2A] flex flex-col z-40 w-64 transform transition-transform duration-300 md:relative md:translate-x-0 shrink-0 shadow-2xl md:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-[#2A2A2A] flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-[#888] font-semibold">历史爆款记录</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {histories.length === 0 ? (
              <div className="text-center py-8 text-sm text-[#666] border border-dashed border-[#333] rounded-lg">
                还没写过？<br/>搞点大新闻出来！
              </div>
            ) : (
              histories.map(history => (
                <div
                  key={history.id}
                  onClick={() => {
                    setActiveHistoryId(history.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left p-3 rounded cursor-pointer transition-colors border ${
                    activeHistoryId === history.id 
                      ? 'bg-[#222] border-[#333]' 
                      : 'border-transparent hover:bg-[#1A1A1A]'
                  }`}
                >
                  <p className="text-sm font-medium truncate text-[#E5E5E5]">{history.topic}</p>
                  <p className="text-[10px] text-[#666] mt-1">
                    {new Date(history.timestamp).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.')} · {history.content.length}字
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[#2A2A2A] bg-[#0F0F0F]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#FF5C00] flex items-center justify-center font-bold text-black text-xs">
                {user?.[0]?.toUpperCase()}
              </div>
              <div className="text-xs">
                <p className="font-bold text-[#E5E5E5] truncate max-w-[100px]">{user}</p>
                <p className="text-[#666]">分析师</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-1.5 text-[#666] hover:text-white rounded hover:bg-[#222] transition-colors"
              title="退出"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-[#2A2A2A] flex items-center justify-between px-4 sm:px-8 bg-[#0F0F0F] shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              className="md:hidden p-1.5 -ml-1.5 text-[#888] hover:text-white hover:bg-[#222] rounded-md transition-colors"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:block w-2 h-2 bg-[#FF5C00] rounded-full"></div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight italic text-white flex items-center">
              爆款写作智能体 <span className="text-[#666] text-xs not-italic font-normal ml-2">v2.4 Pro</span>
              {activeHistoryId && <span className="text-[10px] uppercase font-normal bg-[#222] px-2 py-1 rounded text-[#FF5C00] border border-[#333] ml-2 sm:ml-3 tracking-widest hidden sm:inline-block">历史快照</span>}
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {activeHistoryId && (
              <button
                onClick={() => {
                  setActiveHistoryId(null);
                  setTopic('');
                  setFiles([]);
                  setDraftContent('');
                }}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest bg-[#1A1A1A] hover:bg-[#222] border border-[#2A2A2A] text-[#888] hover:text-white px-3 py-1.5 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
                新文章
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-[#222] rounded-md border border-[#2A2A2A] transition-colors text-[#888] hover:text-white"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 flex flex-col p-4 sm:p-8 gap-4 sm:gap-6 overflow-hidden">
          {/* Input Section */}
          <section className="space-y-4 shrink-0">
            {!activeHistoryId ? (
              <>
                <div className="relative">
                  <label className="text-[10px] uppercase tracking-widest text-[#888] font-bold mb-2 block">核心话题</label>
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="还没写过爆款？输入个话题，我们现在就搞一篇..."
                    disabled={isGenerating}
                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-none p-4 text-lg text-white focus:ring-1 focus:ring-[#FF5C00] focus:border-[#FF5C00] outline-none h-24 transition-all placeholder:text-[#444] disabled:opacity-50 resize-none"
                  />
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] uppercase tracking-widest text-[#888] font-bold block">补充参考资料 (Word/PDF/图, Max 5, 5MB)</label>
                    <span className="text-xs text-[#666]">{files.length} / 5</span>
                  </div>
                  
                  {files.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 bg-[#1A1A1A] border border-[#2A2A2A] px-2 py-1 rounded text-xs text-[#E5E5E5] group relative pr-7 border-l-2 border-l-[#FF5C00]">
                           <span className="truncate max-w-[120px] font-medium">{file.name}</span>
                           <button 
                             onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))} 
                             className="absolute right-1 text-[#666] hover:text-red-500 transition-colors"
                           >
                             <X className="w-3 h-3" />
                           </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 sm:h-14">
                    <div className="relative group h-14 sm:h-full">
                       <input
                        type="file"
                        multiple
                        accept=".pdf,.docx,image/*"
                        onChange={(e) => {
                          const selectedFiles = Array.from(e.target.files || []);
                          if (selectedFiles.length + files.length > 5) {
                            showToast('最多只能上传5份文件', 'error');
                            return;
                          }
                          
                          const validFiles = selectedFiles.filter(file => {
                            if (file.size > 5 * 1024 * 1024) {
                              showToast(`文件 ${file.name} 超过5MB限制`, 'error');
                              return false;
                            }
                            const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
                            // some browsers might not detect docx mime type correctly, checking extension too
                            const isDocx = file.name.endsWith('.docx') || validTypes.includes(file.type);
                            if (file.name.endsWith('.doc') || file.type === 'application/msword') {
                               showToast(`不支持旧版 .doc 格式，请另存为 .docx`, 'error');
                               return false;
                            }
                            if (!isDocx && file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
                              showToast(`文件 ${file.name} 格式不支持`, 'error');
                              return false;
                            }
                            return true;
                          });

                          setFiles(prev => [...prev, ...validFiles].slice(0, 5));
                          e.target.value = '';
                        }}
                        disabled={isGenerating || files.length >= 5}
                        className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <div className={`absolute inset-0 bg-[#1A1A1A] border border-[#2A2A2A] p-4 flex items-center justify-between transition-colors overflow-hidden rounded ${files.length >= 5 ? 'opacity-50' : 'group-hover:border-[#444]'}`}>
                        <div className="flex items-center justify-center gap-2 w-full">
                          <Paperclip className="w-5 h-5 text-[#FF5C00] shrink-0" />
                          <span className="text-sm font-bold tracking-widest text-[#888]">上传文件</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={generateContent}
                      disabled={isGenerating || !topic.trim()}
                      className="bg-[#FF5C00] rounded text-black font-black uppercase tracking-widest h-14 sm:h-full hover:bg-[#FF7A30] transition-all flex items-center justify-center gap-2 disabled:bg-[#333] disabled:text-[#666] disabled:cursor-not-allowed"
                    >
                      <span>立即生成爆款文章</span>
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // View mode for active history
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="text-[10px] uppercase tracking-widest text-[#888] font-bold mb-2 block">当时的话题</label>
                  <div className="w-full bg-[#1A1A1A] border border-[#2A2A2A] p-4 text-lg min-h-[6rem] text-white">
                    {activeHistory.topic}
                  </div>
                </div>
                {activeHistory.materials && (
                  <div className="relative">
                    <label className="text-[10px] uppercase tracking-widest text-[#888] font-bold mb-2 block">当时补充的资料</label>
                    <div className="w-full bg-[#1A1A1A] border border-[#2A2A2A] p-4 text-sm text-[#AAA] min-h-[6rem] overflow-y-auto">
                      {activeHistory.materials}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Output Preview */}
          <section className="flex-1 bg-[#141414] border border-[#2A2A2A] flex flex-col relative min-h-0">
            <div className="p-3 bg-[#1A1A1A] border-b border-[#2A2A2A] flex items-center justify-between shrink-0">
              <span className="text-[10px] font-bold text-[#666] tracking-widest">OUTPUT PREVIEW / MARKDOWN</span>
              <button 
                onClick={handleCopy}
                disabled={!displayContent}
                className="text-[10px] border border-[#2A2A2A] px-3 py-1 hover:bg-[#222] transition-colors text-[#888] hover:text-white disabled:opacity-50"
              >
                COPY FULL TEXT
              </button>
            </div>
            
            <div ref={scrollRef} className="flex-1 p-4 sm:p-8 overflow-y-auto font-serif leading-relaxed">
              {displayContent ? (
                <div className="max-w-2xl mx-auto pb-12">
                   <div className="markdown-body">
                    <Markdown remarkPlugins={[remarkGfm]}>{displayContent}</Markdown>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-[#444]">
                  <FileText className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm font-sans tracking-widest uppercase">No Content Generated</p>
                </div>
              )}
            </div>

            {isGenerating && (
              <div className="absolute bottom-8 right-8 bg-[#FF5C00] text-black px-6 py-3 font-bold shadow-2xl flex items-center gap-3 z-20">
                <div className="w-4 h-4 bg-black rounded-full animate-pulse"></div>
                <span>卢俊正在疯狂码字中...</span>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
