import PropTypes from "prop-types";

function MainContent({ children }) {
  return (
    <main
      className="
        min-w-0
        flex-1
        overflow-y-auto
        overflow-x-hidden
        bg-[#070a0e]

        [scrollbar-width:none]
        [&::-webkit-scrollbar]:hidden
      "
    >
      <div className="min-h-full w-full">
        {children}
      </div>
    </main>
  );
}

MainContent.propTypes = {
  children: PropTypes.node.isRequired,
};

export default MainContent;
