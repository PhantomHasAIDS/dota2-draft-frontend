import { useEffect, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import axios from "axios";
import { groupAndSortHeroes } from "../utils/groupHeroes";
import infoButtonIcon from '../assets/info_button.png';
import '../App.css';

const BASE_URL = "https://dota2-backend.onrender.com";


export default function HeroList() {

  const [selectedHeroes, setSelectedHeroes] = useState({
    ally: [],
    enemy: []
  });

  const [suggestedHeroes, setSuggestedHeroes] = useState([]);

  const [selectedTeam, setSelectedTeam] = useState("ally");
  
  const [bannedHeroes, setBannedHeroes] = useState([]);

  const [clickLockedHeroes, setClickLockedHeroes] = useState(new Set());

  const [heroes, setHeroes] = useState({});
  
  const[roleFilter, setRoleFilter] = useState(null);

  const [fullDraftStats, setFullDraftStats] = useState(null);

  const [gridMode, setGridMode] = useState("default");

  const [showGuide, setShowGuide] = useState(false);

  const [buttonPulse, setButtonPulse] = useState(false);

  const hasPicks = selectedHeroes.ally.length > 0 || selectedHeroes.enemy.length > 0;

  const updateSynergySuggestions = (
    ally = selectedHeroes.ally,
    enemy = selectedHeroes.enemy,
    bans = bannedHeroes,
    role = roleFilter
  ) => {

    if (ally.length === 0 && enemy.length === 0) {
      setSuggestedHeroes([]);
      return;
    }

    const isFullDraft = ally.length === 5 && enemy.length === 5;

    fetch(`${BASE_URL}/api/synergy-picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allyHeroIds: ally.map(h => h.HeroId),
        enemyHeroIds: enemy.map(h => h.HeroId),
        bannedHeroIds: bans.map(h => h.HeroId),
        roleFilter: isFullDraft ? null : role,
        fullDraft: isFullDraft
      }),
    })
      .then(res => res.json())
    .then(data => {
      if (isFullDraft && data.teams) {
        setFullDraftStats(data.teams);
      } else {
        setSuggestedHeroes(data);
        setFullDraftStats(null);
      }
    })
    .catch(err => console.error("Failed to update synergy suggestions:", err));
};

  const lockHero = (heroId) => {
    setClickLockedHeroes((prev) => new Set(prev).add(heroId));
  };

  const unlockHero = (heroId) => {
    setClickLockedHeroes((prev) => {
      const updated = new Set(prev);
      updated.delete(heroId);
      return updated;
    });
  };

  const handleClearBans = () => {
      setBannedHeroes([]);
      updateSynergySuggestions(selectedHeroes.ally, selectedHeroes.enemy, []);
  }

  function DraggableHero({ hero, isPicked, handleHeroClick, handleHeroBan }) {
    const [{ isDragging }, drag] = useDrag(() => ({
      type: "HERO",
      item: { hero },
      canDrag: !isPicked,
      collect: (monitor) => ({
        isDragging: !!monitor.isDragging(),
      }),
    }));

    const handleClick = () => {
      if (!isPicked) handleHeroClick(hero);
    };

    const handleRightClick = (e) => {
      e.preventDefault();
      if (!isPicked) handleHeroBan(hero)
    }

    return (
      <button
        ref={drag}
        onClick={handleClick}
        onContextMenu={handleRightClick}
        disabled={isPicked}
        className={`w-[106px] h-[76px] rounded shadow text-center transition
          ${isPicked ? "bg-gray-600 opacity-40 cursor-not-allowed" : "bg-gray-800 hover:ring-2 hover:ring-yellow-400"}
          ${isDragging ? "opacity-30" : ""}`}
      >
        <img src={hero.icon_url} alt={hero.name} className="w-full h-15 object-contain mx-auto" />
        <h3 className="text-xs font-medium px-1 truncate">{hero.name}</h3>
      </button>
    );
  }

  function TeamDropZone ({ team }) {
    const [collectedProps, dropRef] = useDrop(() => ({
      accept: "HERO",
      drop: (item) => handleDrop(item.hero, team),
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }));

    const isOver = collectedProps.isOver;
    const isAlly = team === "ally";
    const heroes2 = isAlly ? selectedHeroes.ally : selectedHeroes.enemy;

    return (
      <div
        ref={dropRef}
        className={`flex gap-2 p-1 rounded transition-all duration-200
          ${isOver ? "bg-yellow-500/20" : ""}
        `}
      >
        {[...Array(5)].map((_, i) => (
          <div key={i} className="relative w-[106px] h-[60px] bg-gray-700 rounded overflow-hidden flex items-center justify-center">
            {heroes2[i] && (
              <div
                className="relative group w-full h-full cursor-pointer"
                onClick={() => handleHeroDeselect(heroes2[i], team)}
              >
                <img
                  src={heroes2[i].icon_url}
                  alt={heroes2[i].name}
                  className="object-contain w-full h-full"
                />
                <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-75 flex items-center justify-center transition-opacity duration-200">
                  <span className="text-red-400 font-bold text-sm">REMOVE</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function getWinProbability(delta) {
    const maxWinrate = 80;
    const minWinrate = 20;
    const growthRate = 0.025;
    const adjusted = delta * growthRate;

    const probability = 50 + (maxWinrate - 50) * Math.tanh(adjusted);
    return Math.max(minWinrate, Math.min(maxWinrate, probability.toFixed(2)));
  }

  const handleHeroClick = async (hero) => {
  if (clickLockedHeroes.has(hero.HeroId)) return;

  lockHero(hero.HeroId);

  const team = selectedTeam;
  const allyIds = selectedHeroes.ally.map(h => h.HeroId);
  const enemyIds = selectedHeroes.enemy.map(h => h.HeroId);

  try {
    const response = await fetch(`${BASE_URL}/api/select-hero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heroId: hero.HeroId,
        team,
        allyHeroIds: allyIds,
        enemyHeroIds: enemyIds,
      }),
    });

    const data = await response.json();
    if (data?.message === "Hero selected") {
      const updatedSelected = {
        ...selectedHeroes,
        [team]: [...selectedHeroes[team], hero],
      };
      setSelectedHeroes(updatedSelected);

      setTimeout(updateSynergySuggestions, 0);
    }

  } catch (err) {
    console.error("❌ Failed to select hero:", err);
  } finally {
    unlockHero(hero.HeroId);
  }
  }


  const handleDrop = async (hero, team) => {
  if (clickLockedHeroes.has(hero.HeroId)) return;
  if (selectedHeroes[team].some(h => h.HeroId === hero.HeroId)) return;
  if (selectedHeroes[team].length >= 5) return;

  lockHero(hero.HeroId);

  const allyIds = selectedHeroes.ally.map(h => h.HeroId);
  const enemyIds = selectedHeroes.enemy.map(h => h.HeroId);

  try {
    const response = await fetch(`${BASE_URL}/api/select-hero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heroId: hero.HeroId,
        team,
        allyHeroIds: allyIds,
        enemyHeroIds: enemyIds,
      }),
    });

    const data = await response.json();
    if (data?.message === "Hero selected") {
      const updatedSelected = {
        ...selectedHeroes,
        [team]: [...selectedHeroes[team], hero]
      };
      setSelectedHeroes(updatedSelected);
      setTimeout(updateSynergySuggestions, 0);
    } else {
      console.warn("Drop hero response:", data?.message);
    }
  } catch (err) {
    console.error(`Failed to drop hero to ${team} team`, err);
  } finally {
    unlockHero(hero.HeroId);
  }
  }

  const handleHeroDeselect = (hero, team) => {

    const newSelected = {
      ...selectedHeroes,
      [team]: selectedHeroes[team].filter(h => h.HeroId !== hero.HeroId),
    };

    setSelectedHeroes(newSelected);

    updateSynergySuggestions(newSelected.ally, newSelected.enemy, bannedHeroes);
  }

  const handleClear = () => {
    setSelectedHeroes({ ally: [], enemy: [] });
    setSuggestedHeroes([]);
    setBannedHeroes([]);
    setClickLockedHeroes(new Set());
  };

  const handleBanRemove = (hero) => {
    const updatedBans = bannedHeroes.filter(h => h.HeroId !== hero.HeroId);
    setBannedHeroes(updatedBans);
    updateSynergySuggestions(selectedHeroes.ally, selectedHeroes.enemy, updatedBans);
  }

  const handleHeroBan = async (hero) => {
    if (bannedHeroes.length >= 16) return;
    if (clickLockedHeroes.has(hero.HeroId)) return;

    lockHero(hero.HeroId);

    try {
      const updatedBans = [...bannedHeroes, hero];
      setBannedHeroes(updatedBans)

      updateSynergySuggestions();
        
    } catch (err) {
      console.error("Failed to ban hero:", err);
    } finally {
      unlockHero(hero.HeroId);
    }
  }

  useEffect(() => {
    axios
      .get(`${BASE_URL}/heroes`)
      .then((res) => {
        const grouped = groupAndSortHeroes(res.data);
        setHeroes(grouped);
      })
      .catch((err) => console.error("Failed to fetch heroes:", err));
  }, []);

  useEffect(() => {
  if (selectedHeroes.ally.length > 0 || selectedHeroes.enemy.length > 0) {
    updateSynergySuggestions();
  } else {
    // Clear suggestions if all heroes are removed
    setSuggestedHeroes([]);
  }
}, [selectedHeroes, bannedHeroes]);

function renderAttributeColumn(attr) {
  const colorMap = {
    str: { border: "border-red-600", bg: "bg-red-900/10", text: "text-red-600", label: "Strength" },
    agi: { border: "border-green-600", bg: "bg-green-900/10", text: "text-green-600", label: "Agility" },
    int: { border: "border-blue-600", bg: "bg-blue-900/10", text: "text-blue-600", label: "Intelligence" },
    all: { border: "border-purple-600", bg: "bg-purple-900/10", text: "text-purple-600", label: "Universal" },
  };

  const { border, bg, text, label } = colorMap[attr];

  return (
    <div key={attr} className={`flex-1 border-2 rounded-lg p-4 space-y-2 ${border} ${bg}`}>
      <h2 className={`text-xl font-bold mb-2 ${text}`}>{label}</h2>
      <div className="flex flex-wrap gap-2">
        {heroes[attr]?.map((hero) => {
          const isPicked =
            selectedHeroes.ally.some(h => h.HeroId === hero.HeroId) ||
            selectedHeroes.enemy.some(h => h.HeroId === hero.HeroId) ||
            bannedHeroes.some(h => h.HeroId === hero.HeroId) ||
            clickLockedHeroes.has(hero.HeroId);

          return (
            <DraggableHero
              key={hero.HeroId}
              hero={hero}
              isPicked={isPicked}
              handleHeroClick={handleHeroClick}
              handleHeroBan={handleHeroBan}
            />
          );
        })}
      </div>
    </div>
  );
}

  return (
    <div className="p-2 bg-black text-white h-screen overflow-hidden flex flex-col">
      {/* Drafting Panel with Title */}
      <div className="mb-2 bg-gray-800 rounded shadow px-4 py-2 relative flex items-center justify-between">
        <div className="flex items-center flex-shrink-0 z-10">
          <h1 className="text-2xl font-bold text-white mr-2">Dota 2 Counter Tool</h1>
          <button
            onClick={() => {setShowGuide(prev => !prev);
              setButtonPulse(true);
              setTimeout(() => setButtonPulse(false), 500);
            }}
            className={`w-[30px] h-[30px] bg-white bg-opacity-0 text-black font-bold rounded transition-transform duration-200 ${
              buttonPulse ? 'animate-pulse' : ''
            }`}
            title="Info"
            >
              <img src={infoButtonIcon} alt="Info" className="filter invert"/>
            </button>
        </div>
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-6 z-0">
          <TeamDropZone team="ally" />
          <div className="flex justify-center">
            <button
              onClick={() => setSelectedTeam(prev => prev === "ally" ? "enemy" : "ally")}
              className={`w-[188px] px-4 py-1 rounded-full text-white text-sm font-semibold transition 
              ${selectedTeam === "ally" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
            >
              Picking for: {selectedTeam === "ally" ? "Ally Team" : "Enemy Team"}
            </button>
          </div>
          <TeamDropZone team="enemy" /> 
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 z-10">
          <button
            onClick={handleClearBans}
            className="w-[71px] h-[60px] bg-gray-200 hover:bg-gray-300 text-black font-bold rounded"
          >
            Clear Bans
          </button>
          <button
            onClick={handleClear}
            className="w-[71px] h-[60px] bg-gray-200 hover:bg-gray-300 text-black font-bold rounded"
          >
            Clear All
          </button>
        </div>
      </div>
      {bannedHeroes.length > 0 || true ? (
        <div className="flex flex-col items-center w-full">
          <div className="relative w-full h-6 mb-1">
            <button
              onClick={() => setGridMode(prev => prev === "default" ? "row" : "default")}
              className="absolute left-2 top-1/2 transform -translate-y-1/2 w-12 h-6 bg-gray-500 rounded-full p-1 transition-colors duration-300 ease-in-out"
              title="Toggle Grid Layout"
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${
                    gridMode === "row" ? "translate-x-6" : "translate-x-0"
                  }`}
                />
                {/* Place images here */}
            </button>
            <h2 className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 text-sm font-semibold text-white mb-1">Bans:</h2>
          </div>
          <div className="flex justify-center mb-2 gap-2">
            {[...Array(16)].map((_, i) => (
              <div
                key={i}
                className="w-[71px] h-[40px] bg-gray-900 border border-gray-700 rounded flex items-center justify-center overflow-hidden"
              >
                {bannedHeroes[i] && (
                  <div
                    className="relative group w-full h-full cursor-pointer"
                    onClick={() => handleBanRemove(bannedHeroes[i])}
                  >
                    <img
                      src={bannedHeroes[i].icon_url}
                      alt={bannedHeroes[i].name}
                      className="object-contain w-full h-full filter grayscale"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                    <span className="text-red-400 font-bold text-[10px]">REMOVE</span>
                  </div>
                </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        {/* Main hero area */}
        <div className="flex flex-col flex-1 pr-3 overflow-y-auto gap-4">
          {/* Top Row: Strength + Agility */}
          {gridMode === "default" ? (
            <>
              {/* Default mode: 2 stacked rows */}
              <div className="flex gap-4">
                {["str", "agi"].map((attr) => renderAttributeColumn(attr))}
              </div>
              <div className="flex gap-4">
                {["int", "all"].map((attr) => renderAttributeColumn(attr))}
              </div>
            </>
          ) : (
            <>
              {/* Row mode: all attributes in a single row */}
              <div className="flex gap-4">
                {["str", "agi", "int", "all"].map((attr) => renderAttributeColumn(attr))}
              </div>
            </>
          )}
        </div>

        {/* The sidebar */}
        <div className="w-64 bg-gray-800 rounded shadow flex flex-col p-4">
          <div className="flex-1 overflow-y-auto space-y-2">
            {suggestedHeroes.length === 0 && hasPicks === false ? (
                <p className="text-gray-400 text-sm italic">
                  Pick a hero to see recommendations.
                </p>
            ) : (
              <>
                {fullDraftStats ? (
                  <>
                    {/* Header Row */}
                    <div className="flex items-center justify-between text-xs font-bold text-gray-300 border-b border-gray-600 mb-1">
                      <span className="w-10 text-left">Ally</span>
                      <span className="w-10 text-right">Score</span>
                      <div className="border-1 border-gray-500 h-6 mx-1"/>
                      <span className="w-10 text-left">Score</span>
                      <span className="w-10 text-right">Enemy</span>
                    </div>

                    {/* 5 rows for each hero */}
                    {Array.from({ length: 5}).map((_, i) => {
                      const ally = fullDraftStats.ally[i];
                      const enemy = fullDraftStats.enemy[i];
                      return (
                        <div key={i} className="flex items-center justify-between bg-gray-700 rounded px-2 py-1">
                          <img src={ally.icon_url} alt="" className="w-10 h-10 object-contain" />
                          <span className="text-green-400 text-sm font-mono w-10 text-right">
                            {ally.totalScore}
                          </span>
                          <div className="border-1 border-gray-600 h-6 mx-1" />
                          <span className="text-red-400 text-sm font-mono w-10 text-left">
                            {enemy.totalScore}
                          </span>
                          <img src={enemy.icon_url} alt="" className="w-10 h-10 object-contain" />
                        </div>
                      );
                    })}
                    {/* Totals */}
                    <div className="mt-2 flex items-center justify-center gap-2 text-lg font-bold">
                      <span className="text-green-400">
                        {fullDraftStats.ally.reduce((sum, h) => sum + parseFloat(h.totalScore), 0).toFixed(1)}
                      </span>
                      <span className="text-gray-400 text-sm">vs</span>
                      <span className="text-red-400">
                        {fullDraftStats.enemy.reduce((sum, h) => sum + parseFloat(h.totalScore), 0).toFixed(1)}
                      </span>
                    </div>

                    {/* Outcome prediction */}
                    <div className="mt-1 text-center">
                      {(() => {
                        const allyTotal = fullDraftStats.ally.reduce((sum, h) => sum + parseFloat(h.totalScore), 0);
                        const enemyTotal = fullDraftStats.enemy.reduce((sum, h) => sum + parseFloat(h.totalScore), 0);
                        const delta = allyTotal - enemyTotal;
                        const allyWin = getWinProbability(delta);
                        const enemyWin = ((100 - allyWin)).toFixed(2);

                        return (
                          <span className="text-lg font-bold">
                            <span className="text-green-400">{allyWin}%</span>
                            <span className="text-gray-400 mx-1">/</span>
                            <span className="text-red-400">{enemyWin}%</span>
                          </span>
                        );
                      })()}
                    </div>
                    </>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-2 py-1 text-xs font-bold text-gray-300 border-b border-gray-600 mb-1">
                      <span className="w-10">Hero</span>
                      <span className="flex-1 pl-2">Name</span>
                      <span className="text-right pr-1">Synergy</span>
                    </div>
                    {suggestedHeroes.map((hero) => (
                      <div
                        key={hero.HeroId}
                        className="flex items-center justify-between bg-gray-700 rounded px-2 py-1"
                      >
                        <img
                          src={hero.icon_url}
                          alt={hero.name}
                          className="w-10 h-10 object-contain mr-2"
                        />
                        <span className="flex-1 text-sm font-medium text-white truncate">
                          {hero.name}
                        </span>
                        <span className="text-green-400 text-sm font-mono pl-2">
                          {hero.totalScore}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
          {showGuide && (
            <div className="relative bg-gray-700 text-white text-sm rounded-lg p-3 mt-2 shadow-lg guide-flash">
              <button
                onClick={() => setShowGuide(false)}
                className="absolute top-1 right-2 text-gray-300 hover:text-white text-lg font-bold"
              >
                ×
              </button>
              <p className="text-gray-300">
                <strong>Guide:</strong><br />
                Welcome to the ultimate Dota 2 drafting tool. Hero suggestions will show up as you pick. Select heroes either by clicking or dragging them,
                ban them with right-click, and get real-time synergy data to heroes still remaining in the pool. Full draft analysis appears once both teams are filled.
                Hero matchup data will be updated using STRATZ API once a week to maintain the integrity of the app. <br /><br/>
                As this is a love letter to the community, I will keep the app completely ad-free.
              </p>
              {/*Welcome to the ultimate Dota 2 drafting tool, powered by STRATZ API. Your hero suggestions 
                  will be shown here. Once you start selecting heroes to either team, the tool will start 
                  calculating the best possible picks judging by the heroes picked and what is left in the pool. <br /> <br />
                  To select a hero, simply press the hero within the grid below the draft panel. To remove a hero, click
                  them inside the draft panel at the top of your screen. Right click to ban heroes. You can also drag heroes
                  to their respective teams if you so wish.
                  On this sidebar you can see the hero's icon, name and the synergy rating. The higher the synergy rating, 
                  the stronger the hero pick. The synergy rating shows the hero-specific increase in winrate from the
                  baseline (50%) according to the heroes picked and banned.<br /><br />
                  Thank you to reddit user u/Winter-Nectarine-601 for the idea. This was a fun little project to do
                  and I'll aim to keep it updated as long as possible if it gains enough traction. Site data will be updated once a week. <br /> <br />
                  Note: This tool is based on pure statistical analysis. It is just a prototype for now
                  and platform-specific (i.e. mobile, different screen resolutions) support might be added later down the line.
                  If you happen to encounter any bugs while using the tool, the "Clear All" button should restart everything.*/}
            </div>
          )}
          <div className="mt-4 border-t border-gray-700 pt-2">
            <p className="text-gray-300 text-sm mb-1">Suggestion filters:</p>
            <div className="flex mb-3 space-x-2">
              <button
                onClick={() => {
                  const newFilter = roleFilter === "Carry" ? null : "Carry";
                  setRoleFilter(newFilter);
                  updateSynergySuggestions(
                    selectedHeroes.ally,
                    selectedHeroes.enemy,
                    bannedHeroes,
                    newFilter
                  );
                }}
                className={`px-3 py-1 rounded text-sm font-semobold transition-colors duration-150 ${
                  roleFilter === "Carry"
                    ? "bg-green-600 text-white"
                    : "bg-gray-600 text-gray-300"
                }`}
              >
                Carry
              </button>

              <button
                onClick={() => {
                  const newFilter = roleFilter === "Support" ? null : "Support";
                  setRoleFilter(newFilter);
                  updateSynergySuggestions(
                    selectedHeroes.ally,
                    selectedHeroes.enemy,
                    bannedHeroes,
                    newFilter
                  );
                }}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors duration-150 ${
                  roleFilter === "Support"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-600 text-gray-300"
                }`}
              >
                Support
              </button>
            </div>
          </div>
          <div className="text-white text-xs border-t border-gray-700 pt-2">
            <p>Patch: 7.39c</p>
            <p>Last updated: July 4</p>
          </div>
        </div>
      </div>
    </div>
  );
}