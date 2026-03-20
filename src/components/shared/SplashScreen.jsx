import { useState } from "react";
import { SPLASH_LOGO_SRC, SPLASH_LOGO_ALT } from "../../constants.js";

export function SplashScreen() {
  const [logoFailed, setLogoFailed] = useState(false);
  const showImage = Boolean(SPLASH_LOGO_SRC) && !logoFailed;

  return (
    <div className="splash-screen" aria-label="flash auto スプラッシュスクリーン">
      <div className="splash-mark">
        {showImage ? (
          <>
            <img
              className="splash-logo-image"
              src={SPLASH_LOGO_SRC}
              alt={SPLASH_LOGO_ALT}
              onError={() => setLogoFailed(true)}
            />
            <span className="splash-logo-text">flash auto</span>
          </>
        ) : (
          <span className="splash-logo-text">flash auto</span>
        )}
      </div>
    </div>
  );
}
