import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "./lib/supabase";
import AdminRoute from "./components/AdminRoute";
import EmployeeRoute from "./components/EmployeeRoute";

import AdminLogin from "./pages/Signup";
import Home from "./pages/Home";
import EmployeeHome from "./pages/EmployeeHome";
import AdminHome from "./pages/AdminHome";
import EmployeeSetup from "./pages/EmployeeSetup";
import EmployeeDetails from "./pages/EmployeeDetails";
import EmployeeEdit from "./pages/EmployeeEdit";
import StaffDashboard from "./pages/StaffDashboard";
import CreateEmployee from "./pages/CreateEmployee";
import CustomerTransactionsReport from "./pages/CustomerTransactionsReport";
import TransactionDetails from "./pages/TransactionDetails";
import TransactionDetailPage from "./pages/TransactionDetailPage";
import CustomerListPage from "./pages/CustomerListPage";
import CustomerForm from "./pages/CustomerForm";
import CustomerDetails from "./pages/CustomerDetails";
import CustomerProfile from "./pages/CustomerProfile";
import TransactionEntry from "./pages/TransactionEntry";
import TransactionSuccess from "./pages/TransactionSuccess";
import AddProductPage from "./pages/AddProductPage";
import EditProductPage from "./pages/EditProductPage";
import ProductDetails from "./pages/ProductDetails";
import StockEntry from "./pages/StockEntry";
import StockSuccess from "./pages/StockSuccess";
import InventoryReport from "./pages/InventoryReport";
import SharedLedgerView from "./pages/SharedLedgerView";
import SettingsPage from "./pages/SettingsPage";
import RecycleBinPage from "./pages/RecycleBinPage";
import ReminderMessageEditor from "./pages/ReminderMessageEditor";
import CollectionRouteEditor from "./pages/CollectionRouteEditor";

function AppShell() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      const role = localStorage.getItem("khata_role");

      if (role === "admin") {
        console.log("[Auth] Admin restored");
        setReady(true);
        return;
      }

      if (role === "employee") {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            console.log("[Auth] Employee restored");
            setReady(true);
            return;
          }
          localStorage.removeItem("khata_role");
          localStorage.removeItem("khata_user");
        } catch {
          localStorage.removeItem("khata_role");
          localStorage.removeItem("khata_user");
        }
        console.log("[Auth] No session found");
        setReady(true);
        return;
      }

      console.log("[Auth] No session found");
      setReady(true);
    };
    init();
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/home" element={<Home />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/employee/home" element={<EmployeeRoute><EmployeeHome /></EmployeeRoute>} />
      <Route path="/admin/home" element={<AdminRoute><AdminHome /></AdminRoute>} />
      <Route path="/admin/employees/setup" element={<AdminRoute><EmployeeSetup /></AdminRoute>} />
      <Route path="/admin/employees/:id" element={<AdminRoute><EmployeeDetails /></AdminRoute>} />
      <Route path="/admin/employees/:id/edit" element={<AdminRoute><EmployeeEdit /></AdminRoute>} />
      <Route path="/admin/staff" element={<AdminRoute><StaffDashboard /></AdminRoute>} />
      <Route path="/admin/staff/new" element={<AdminRoute><CreateEmployee /></AdminRoute>} />
      <Route path="/admin/reports/customer-transactions" element={<AdminRoute><CustomerTransactionsReport /></AdminRoute>} />
      <Route path="/admin/reports/customer-transactions/:id" element={<AdminRoute><TransactionDetails /></AdminRoute>} />
      <Route path="/customers/add" element={<CustomerListPage />} />
      <Route path="/party/new" element={<CustomerForm />} />
      <Route path="/customer/:id" element={<CustomerDetails />} />
      <Route path="/customer/:id/profile" element={<CustomerProfile />} />
      <Route path="/customer/:id/transaction" element={<TransactionEntry />} />
      <Route path="/customer/:id/transaction/success" element={<TransactionSuccess />} />
      <Route path="/transaction/:id" element={<TransactionDetailPage />} />

      {/* Catalogue & Inventory */}
      <Route path="/catalogue/add" element={<AdminRoute><AddProductPage /></AdminRoute>} />
      <Route path="/product/:id" element={<ProductDetails />} />
      <Route path="/product/:id/edit" element={<AdminRoute><EditProductPage /></AdminRoute>} />
      <Route path="/product/:id/stock-in" element={<AdminRoute><StockEntry /></AdminRoute>} />
      <Route path="/product/:id/stock-out" element={<AdminRoute><StockEntry /></AdminRoute>} />
      <Route path="/product/:id/stock-success" element={<AdminRoute><StockSuccess /></AdminRoute>} />
      <Route path="/catalogue/reports" element={<AdminRoute><InventoryReport /></AdminRoute>} />
      <Route path="/share/customer/:id" element={<SharedLedgerView />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/settings/recycle-bin" element={<RecycleBinPage />} />
      <Route path="/settings/reminder-message" element={<ReminderMessageEditor />} />
      <Route path="/settings/collection-route" element={<AdminRoute><CollectionRouteEditor /></AdminRoute>} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;