import Header from "@/components/header";
import Divination from "@/components/divination";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 flex flex-col overflow-auto">
        <Divination />
        <Footer />
      </div>
    </div>
  );
}
