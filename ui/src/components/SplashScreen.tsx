import React from 'react';
import './SplashScreen.css';

interface SplashScreenProps {
    onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
    React.useEffect(() => {
        const timer = setTimeout(() => {
            onComplete();
        }, 2000);

        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div className="splash-screen geometric">
            {/* Clean Retrowave Background (Radial Gradient) */}

            {/* Retrowave Grid Floor */}
            <div className="horizon-glow-line"></div>
            <div className="grid-floor-container">
                <div className="grid-floor"></div>
            </div>

            {/* Hovering Logo Panel */}
            <div className="hovering-logo-stage">
                <div className="logo-panel-premium">
                    <h1 className="logo-text">
                        <span className="part-white">Abrams</span>
                        <span className="part-blue">13F</span>
                    </h1>
                    <div className="logo-separator"></div>
                    <p className="logo-tagline">13F HOLDINGS INTELLIGENCE</p>
                </div>
            </div>

            {/* Bottom Meta Info */}
            <div className="splash-meta-bottom">
                <div className="progress-track">
                    <div className="progress-fill"></div>
                </div>
                <p className="legal-text">POWERED BY SEC EDGAR DATA</p>
            </div>
        </div>
    );
};
