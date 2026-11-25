function MainContent({ children }) {
  return (
    <main
      id="main-content"
      tabIndex={0}
      className="
        relative
        min-h-0
        min-w-0
        w-full
        flex-1
        overflow-x-hidden
        overflow-y-auto
        overscroll-y-contain
        bg-[#08090d]
        text-white
        [scrollbar-width:none]
        [&::-webkit-scrollbar]:hidden
        focus:outline-none
      "
    >
      {children}
    </main>
  );
}

export default MainContent;