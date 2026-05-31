import { useEffect, useState } from 'react';
import { X, Keyboard, Command, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }
      
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-bgCard border border-borderActive rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '85vh' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-borderBase bg-bgBase/50">
              <div className="flex items-center gap-2 text-textPrimary font-bold tracking-wide">
                <Keyboard size={18} className="text-cyan-400" />
                <span>Keyboard Shortcuts & Markdown</span>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-textGhost hover:text-textPrimary hover:bg-bgHover rounded-md transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-6 space-y-8">
              
              {/* Markdown Section */}
              <section>
                <h3 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <FileText size={14} /> Markdown Chat Formatting
                </h3>
                <div className="grid gap-2">
                  <ShortcutRow keys={["*text*"]} action="Bold text" desc="Makes text bold (also **text**)" />
                  <ShortcutRow keys={["_text_"]} action="Italic text" desc="Italicizes text" />
                  <ShortcutRow keys={["`code`"]} action="Inline code" desc="Formats text as inline code" />
                  <ShortcutRow keys={["```code```"]} action="Code block" desc="Multi-line syntax highlighted code" />
                </div>
              </section>

              {/* Global Section */}
              <section>
                <h3 className="text-xs font-mono font-bold text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Command size={14} /> Global Shortcuts
                </h3>
                <div className="grid gap-2">
                  <ShortcutRow keys={["Shift", "?"]} action="Show Shortcuts" desc="Open this exact cheat sheet menu" />
                  <ShortcutRow keys={["Ctrl", "V"]} action="Paste / Upload" desc="Instantly upload image from clipboard" />
                  <ShortcutRow keys={["Esc", "Esc"]} action="Panic Mode" desc="Instantly black out the screen" />
                  <ShortcutRow keys={["Esc"]} action="Close" desc="Close modals, viewers, or focus" />
                </div>
              </section>

              {/* Chat Section */}
              <section>
                <h3 className="text-xs font-mono font-bold text-green-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Keyboard size={14} /> Chat & Room Shortcuts
                </h3>
                <div className="grid gap-2">
                  <ShortcutRow keys={["Enter"]} action="Send Message" desc="Send typed message or attached files" />
                  <ShortcutRow keys={["Shift", "Enter"]} action="New Line" desc="Drop cursor to new line without sending" />
                </div>
              </section>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ShortcutRow({ keys, action, desc }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-bgBase border border-borderBase hover:border-borderActive transition-colors">
      <div className="flex flex-col">
        <span className="text-sm font-bold text-textPrimary">{action}</span>
        <span className="text-xs text-textSecondary">{desc}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {keys.map((k, i) => (
          <span key={i} className="px-2 py-1 bg-bgCard border border-borderActive rounded text-xs font-mono font-bold text-textSecondary shadow-sm">
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
