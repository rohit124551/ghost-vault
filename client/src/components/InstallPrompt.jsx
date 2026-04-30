import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ghost, X, Share, PlusSquare } from 'lucide-react';

const InstallPrompt = () => {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already running as installed PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    // Check if dismissed before
    const isDismissed = localStorage.getItem('ghostvault_install_dismissed');
    if (isDismissed) return;

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    // Handle Android/Desktop "beforeinstallprompt"
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show prompt after 3 seconds
      setTimeout(() => setShow(true), 3000);
    };

    // For iOS, just show after 3 seconds if not standalone
    if (ios) {
      setTimeout(() => setShow(true), 3000);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('ghostvault_install_dismissed', 'true');
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="install-prompt-container"
        >
          <div className="install-prompt-card">
            <div className="install-prompt-left">
              <div className="ghost-icon-wrapper">
                <Ghost size={24} color="var(--accent)" />
              </div>
            </div>
            
            <div className="install-prompt-center">
              <h3>Install GhostVault</h3>
              <p>Access your vault instantly from your home screen.</p>
              
              {isIOS && (
                <div className="ios-instructions">
                  <div className="ios-step">
                    <Share size={14} /> <span>Tap Share</span>
                  </div>
                  <div className="ios-step">
                    <PlusSquare size={14} /> <span>Add to Home Screen</span>
                  </div>
                </div>
              )}
            </div>

            <div className="install-prompt-right">
              <button className="btn-text" onClick={handleDismiss}>Not now</button>
              {!isIOS ? (
                <button className="btn-pill" onClick={handleInstall}>Install</button>
              ) : (
                <button className="btn-pill" onClick={() => setShow(false)}>Got it</button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InstallPrompt;
